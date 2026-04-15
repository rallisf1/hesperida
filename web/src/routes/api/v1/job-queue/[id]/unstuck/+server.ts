import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { canCancelQueueTask, isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';

const UNSTUCK_MIN_AGE_MS = 5 * 60 * 1000;

type QueueTaskForUnstuck = {
	id?: RecordId;
	status?: string;
	created_at?: string | Date;
};

const parseTimestamp = (value: unknown): number => {
	if (!value) return Number.NaN;
	const asDate = new Date(String(value));
	return asDate.getTime();
};

/**
 * @swagger
 * /api/v1/job-queue/{id}/unstuck:
 *   post:
 *     tags: [JobQueue]
 *     summary: Unstuck a job queue task
 *     description: Only non-viewers can unstuck tasks. Task must be pending and older than 5 minutes.
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
 *         description: Task moved to waiting
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobQueueTaskEnvelope'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;
	if (!canCancelQueueTask(auth.user)) {
		return jsonError(event, 403, 'forbidden', 'Viewer users cannot unstuck tasks.');
	}

	const taskId = new RecordId('job_queue', event.params.id);
	const task = await (isSuperuser(auth.user)
		? withAdminDb((db) =>
				queryOne<QueueTaskForUnstuck>(db, 'SELECT * FROM job_queue WHERE id = $id LIMIT 1;', { id: taskId })
			)
		: withUserDb(auth.token, (db) =>
				queryOne<QueueTaskForUnstuck>(db, 'SELECT * FROM job_queue WHERE id = $id LIMIT 1;', { id: taskId })
			));
	if (!task) return jsonError(event, 404, 'not_found', 'Task not found.');

	if (task.status !== 'pending') {
		return jsonError(event, 409, 'conflict', 'Only pending tasks can be unstuck.', { status: task.status });
	}

	const createdAtMs = parseTimestamp(task.created_at);
	if (!Number.isFinite(createdAtMs)) {
		return jsonError(event, 409, 'conflict', 'Task has an invalid created_at timestamp.');
	}

	const ageMs = Date.now() - createdAtMs;
	if (ageMs < UNSTUCK_MIN_AGE_MS) {
		return jsonError(event, 409, 'conflict', 'Task is not stale enough to be unstuck.', {
			min_age_ms: UNSTUCK_MIN_AGE_MS,
			age_ms: ageMs
		});
	}

	// job_queue update is restricted at schema level; perform write through admin db
	// only after user-scoped access check above.
	const updated = await withAdminDb((db) =>
		queryOne(db, 'UPDATE $id SET status = "waiting", next_run_at = time::now();', { id: taskId })
	);
	if (!updated) return jsonError(event, 409, 'conflict', 'Task is no longer pending.');

	return jsonOk(event, { task: updated });
};
