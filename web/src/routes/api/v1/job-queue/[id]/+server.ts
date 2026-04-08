import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, toRecordId, withAdminDb } from '$lib/server/db';

/**
 * @swagger
 * /api/v1/job-queue/{id}:
 *   get:
 *     tags: [JobQueue]
 *     summary: Get a queue task by id
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
 *         description: Queue task
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const taskId = toRecordId('job_queue', event.params.id);
	const task = await withAdminDb((db) =>
		queryOne(
			db,
			auth.user.role === 'admin'
				? 'SELECT * FROM job_queue WHERE id = type::record($id) LIMIT 1;'
				: 'SELECT * FROM job_queue WHERE id = type::record($id) AND (job.website.owner = type::record($user) OR type::record($user) IN job.website.users) LIMIT 1;',
			{
				id: taskId,
				user: auth.user.id
			}
		)
	);
	if (!task) return jsonError(event, 404, 'not_found', 'Task not found.');
	return jsonOk(event, { task });
};
