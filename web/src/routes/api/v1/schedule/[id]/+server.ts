import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { withUserDb } from '$lib/server/db';
import { canCreateJob } from '$lib/server/policy';
import {
	ensureAccessibleJob,
	getSchedule,
	normalizeCron
} from '$lib/server/schedules';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import { isValidCron } from 'cron-validator';
import { isCronMinIntervalAllowed } from '$lib/cron';
import { config } from '$lib/server/config';

/**
 * @swagger
 * /api/v1/schedule/{id}:
 *   get:
 *     tags: [Schedule]
 *     summary: Get schedule
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Schedule details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ScheduleEnvelope'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Schedule]
 *     summary: Update schedule
 *     description: Non-viewers only. Cron is interpreted in UTC. Frequency is limited by SCHEDULE_MIN_INTERVAL_SECONDS.
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               job: { type: string }
 *               cron: { type: string }
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: Schedule updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ScheduleEnvelope'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Schedule]
 *     summary: Delete schedule
 *     description: Non-viewers only.
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Schedule deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteEnvelope'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const scheduleId = new RecordId('schedule', toRouteId(event.params.id));
	const schedule = await withUserDb(auth.token, (db) => getSchedule(db, scheduleId));
	if (!schedule) {
		return jsonError(event, 404, 'not_found', 'Schedule not found.');
	}

	return jsonOk(event, { schedule });
};

export const PATCH: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	if (!canCreateJob(auth.user)) {
		return jsonError(event, 403, 'forbidden', 'Viewer users cannot update schedules.');
	}

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const scheduleId = new RecordId('schedule', toRouteId(event.params.id));
	const patch: Record<string, unknown> = {};

	if (typeof payload.enabled === 'boolean') {
		patch.enabled = payload.enabled;
	}

	if (typeof payload.cron === 'string') {
		const cron = normalizeCron(payload.cron);
		if (
			!cron.length ||
			!isValidCron(cron, {
				seconds: false,
				alias: true,
				allowBlankDay: false,
				allowSevenAsSunday: true
			})
		) {
			return jsonError(
				event,
				400,
				'bad_request',
				'Invalid cron expression. Expected a valid UTC 5-field cron string.'
			);
		}
		if (!isCronMinIntervalAllowed(cron, config.scheduleMinIntervalSeconds)) {
			const minimumMinutes = Math.ceil(config.scheduleMinIntervalSeconds / 60);
			return jsonError(
				event,
				400,
				'schedule_too_frequent',
				`Schedule is too frequent. Minimum interval is ${minimumMinutes} minutes.`
			);
		}
		patch.cron = cron;
	}

	if (typeof payload.job === 'string') {
		const jobRaw = payload.job.trim();
		if (!jobRaw.length) {
			return jsonError(event, 400, 'bad_request', 'job cannot be empty.');
		}
		patch.job = new RecordId('jobs', toRouteId(jobRaw));
	}

	if (!Object.keys(patch).length) {
		return jsonError(event, 400, 'bad_request', 'At least one field is required (job, cron, enabled).');
	}

	try {
		const schedule = await withUserDb(auth.token, async (db) => {
			const existing = await getSchedule(db, scheduleId);
			if (!existing) return null;

			if (patch.job instanceof RecordId) {
				const hasJob = await ensureAccessibleJob(db, patch.job as RecordId<'jobs'>);
				if (!hasJob) return 'missing_job' as const;
			}

			await db.update(scheduleId).merge(patch);
			return getSchedule(db, scheduleId);
		});

		if (schedule === 'missing_job') {
			return jsonError(event, 404, 'not_found', 'Linked job not found.');
		}
		if (!schedule) {
			return jsonError(event, 404, 'not_found', 'Schedule not found.');
		}

		return jsonOk(event, { schedule });
	} catch (error) {
		return jsonError(event, 400, 'update_failed', (error as Error).message);
	}
};

export const DELETE: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	if (!canCreateJob(auth.user)) {
		return jsonError(event, 403, 'forbidden', 'Viewer users cannot delete schedules.');
	}

	const scheduleId = new RecordId('schedule', toRouteId(event.params.id));

	try {
		const deleted = await withUserDb(auth.token, async (db) => {
			const existing = await getSchedule(db, scheduleId);
			if (!existing) return false;
			await db.delete(scheduleId);
			return true;
		});

		if (!deleted) {
			return jsonError(event, 404, 'not_found', 'Schedule not found.');
		}

		return jsonOk(event, { deleted: true });
	} catch (error) {
		return jsonError(event, 400, 'delete_failed', (error as Error).message);
	}
};
