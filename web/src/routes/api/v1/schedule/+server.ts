import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withUserDb } from '$lib/server/db';
import { canCreateJob } from '$lib/server/policy';
import { ensureAccessibleWebsite, getSchedule, listSchedules, normalizeCron } from '$lib/server/schedules';
import { toRouteId } from '$lib/server/record-id';
import { RecordId, Table } from 'surrealdb';
import { isValidCron } from 'cron-validator';
import { isCronMinIntervalAllowed } from '$lib/cron';
import { config } from '$lib/server/config';
import { tools as ALLOWED_TOOLS } from '$lib/constants';
import type { Tool } from '$lib/types';

/**
 * @swagger
 * /api/v1/schedule:
 *   get:
 *     tags: [Schedule]
 *     summary: List schedules
 *     description: Returns schedules visible to the authenticated user. Optional filters by linked website or linked job.
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: website
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: job
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Schedule list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ScheduleListEnvelope'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   post:
 *     tags: [Schedule]
 *     summary: Create schedule
 *     description: Non-viewers only. Cron is interpreted in UTC. Frequency is limited by SCHEDULE_MIN_INTERVAL_SECONDS.
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [job, cron]
 *             properties:
 *               job: { type: string }
 *               cron: { type: string }
 *               enabled: { type: boolean }
 *     responses:
 *       201:
 *         description: Schedule created
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
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const websiteFilter = event.url.searchParams.get('website');
	const jobFilter = event.url.searchParams.get('job');

	const websiteId = websiteFilter ? new RecordId('websites', toRouteId(websiteFilter)) : undefined;
	const jobId = jobFilter ? new RecordId('jobs', toRouteId(jobFilter)) : undefined;

	const schedules = await withUserDb(auth.token, (db) =>
		listSchedules(db, {
			websiteId,
			jobId
		})
	);

	return jsonOk(event, { schedules });
};

export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	if (!canCreateJob(auth.user)) {
		return jsonError(event, 403, 'forbidden', 'Viewer users cannot create schedules.');
	}

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const websiteRaw = typeof payload.website === 'string' ? payload.website.trim() : '';
	const jobRaw = typeof payload.job === 'string' ? payload.job.trim() : '';
	const cronRaw = typeof payload.cron === 'string' ? payload.cron.trim() : '';
	const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : true;
	const types = Array.isArray(payload.types)
		? payload.types.filter((item): item is Tool => typeof item === 'string' && ALLOWED_TOOLS.includes(item as Tool))
		: [];
	const options =
		payload.options && typeof payload.options === 'object' && !Array.isArray(payload.options)
			? payload.options
			: null;

	if ((!websiteRaw && !jobRaw) || !cronRaw) {
		return jsonError(event, 400, 'bad_request', 'website and cron are required.');
	}

	const cron = normalizeCron(cronRaw);
	if (
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

	try {
		const schedule = await withUserDb(auth.token, async (db) => {
			let websiteId = websiteRaw ? new RecordId('websites', toRouteId(websiteRaw)) : null;
			let scheduleTypes = types;
			let scheduleOptions = options;

			if (!websiteId && jobRaw) {
				const jobId = new RecordId('jobs', toRouteId(jobRaw));
				const source = await queryOne<{ website?: RecordId<'websites'>; types?: Tool[]; options?: Record<string, unknown> | null }>(
					db,
					'SELECT website, types, options FROM jobs WHERE id = $id LIMIT 1;',
					{ id: jobId }
				);
				if (!source?.website) return null;
				websiteId = new RecordId('websites', toRouteId(source.website));
				scheduleTypes = Array.isArray(source.types) ? source.types : [];
				scheduleOptions = source.options ?? null;
			}

			if (!websiteId) return null;
			const hasWebsite = await ensureAccessibleWebsite(db, websiteId);
			if (!hasWebsite) return null;
			if (!scheduleTypes.length) scheduleTypes = ['probe'];

			const createdRows = await db
				.create(new Table('schedule'))
				.content({
					website: websiteId,
					types: scheduleTypes,
					options: scheduleOptions,
					cron,
					enabled,
					created: []
				});

			const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;
			if (!created?.id) return null;
			return getSchedule(db, created.id as RecordId<'schedule'>);
		});

		if (!schedule) {
			return jsonError(event, 404, 'not_found', 'Website not found.');
		}

		return jsonOk(event, { schedule }, 201);
	} catch (error) {
		return jsonError(event, 400, 'create_failed', (error as Error).message);
	}
};
