import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonOk } from '$lib/server/http';
import { queryMany, withAdminDb } from '$lib/server/db';

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

	const rows = await withAdminDb((db) => {
		if (auth.user.role === 'admin') {
			return queryMany(db, 'SELECT * FROM job_queue ORDER BY created_at DESC;');
		}

		return queryMany(
			db,
			'SELECT * FROM job_queue WHERE job.website.owner = type::record($user) OR type::record($user) IN job.website.users ORDER BY created_at DESC;',
			{ user: auth.user.id }
		);
	});

	return jsonOk(event, { tasks: rows ?? [] });
};
