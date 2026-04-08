import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, toRecordId, withAdminDb } from '$lib/server/db';

/**
 * @swagger
 * /api/v1/job-queue/{id}/cancel:
 *   post:
 *     tags: [JobQueue]
 *     summary: Cancel a waiting queue task
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;
	if (auth.user.role === 'viewer') {
		return jsonError(event, 403, 'forbidden', 'Viewer users cannot cancel tasks.');
	}

	const taskId = toRecordId('job_queue', event.params.id);
	const task = await withAdminDb((db) =>
		queryOne<{ status?: string }>(
			db,
			auth.user.role === 'admin'
				? 'SELECT * FROM job_queue WHERE id = type::record($id) LIMIT 1;'
				: 'SELECT * FROM job_queue WHERE id = type::record($id) AND (job.website.owner = type::record($user) OR type::record($user) IN job.website.users) LIMIT 1;',
			{ id: taskId, user: auth.user.id }
		)
	);
	if (!task) return jsonError(event, 404, 'not_found', 'Task not found.');

	if (task.status !== 'waiting') {
		return jsonError(event, 409, 'conflict', 'Only waiting tasks can be canceled.', { status: task.status });
	}

	const updated = await withAdminDb((db) =>
		queryOne(db, 'UPDATE $id SET status = "canceled";', {
			id: taskId
		})
	);
	if (!updated) return jsonError(event, 409, 'conflict', 'Task is no longer waiting.');
	return jsonOk(event, { task: updated });
};
