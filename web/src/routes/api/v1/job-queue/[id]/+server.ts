import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';

/**
 * @swagger
 * /api/v1/job-queue/{id}:
 *   get:
 *     tags: [JobQueue]
 *     summary: Get job queue task
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobQueueTaskEnvelope'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const taskId = new RecordId('job_queue', event.params.id);
	const task = isSuperuser(auth.user)
		? await withAdminDb((db) => queryOne(db, 'SELECT * FROM job_queue WHERE id = $id LIMIT 1;', { id: taskId }))
		: await withUserDb(auth.token, (db) => queryOne(db, 'SELECT * FROM job_queue WHERE id = $id LIMIT 1;', { id: taskId }));
	if (!task) return jsonError(event, 404, 'not_found', 'Task not found.');
	return jsonOk(event, { task });
};
