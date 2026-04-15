import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { canCancelQueueTask, isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';

/**
 * @swagger
 * /api/v1/job-queue/{id}/cancel:
 *   post:
 *     tags: [JobQueue]
 *     summary: Cancel a job queue task
 *     description: Only non-viewers can cancel tasks. Task must have waiting status.
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
 *         description: Task canceled
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
		return jsonError(event, 403, 'forbidden', 'Viewer users cannot cancel tasks.');
	}

	const taskId = new RecordId('job_queue', event.params.id);
	const task = await (isSuperuser(auth.user)
		? withAdminDb((db) => queryOne<{ status?: string }>(db, 'SELECT * FROM job_queue WHERE id = $id LIMIT 1;', { id: taskId }))
		: withUserDb(auth.token, (db) =>
				queryOne<{ status?: string }>(db, 'SELECT * FROM job_queue WHERE id = $id LIMIT 1;', { id: taskId })
			));
	if (!task) return jsonError(event, 404, 'not_found', 'Task not found.');

	if (task.status !== 'waiting') {
		return jsonError(event, 409, 'conflict', 'Only waiting tasks can be canceled.', { status: task.status });
	}

	// job_queue update is restricted at schema level; perform write through admin db
	// only after user-scoped access check above.
	const updated = await withAdminDb((db) =>
		queryOne(db, 'UPDATE $id SET status = "canceled";', { id: taskId })
	);
	if (!updated) return jsonError(event, 409, 'conflict', 'Task is no longer waiting.');
	return jsonOk(event, { task: updated });
};
