import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonOk } from '$lib/server/http';
import { queryMany, withAdminDb, withUserDb } from '$lib/server/db';
import { isAdmin } from '$lib/server/policy';

/**
 * @swagger
 * /api/v1/job-queue:
 *   get:
 *     tags: [JobQueue]
 *     summary: List queue tasks for the current user
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue task list
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const rows = isAdmin(auth.user)
		? await withAdminDb((db) => queryMany(db, 'SELECT * FROM job_queue ORDER BY created_at DESC;'))
		: await withUserDb(auth.token, (db) => queryMany(db, 'SELECT * FROM job_queue ORDER BY created_at DESC;'));

	return jsonOk(event, { tasks: rows ?? [] });
};
