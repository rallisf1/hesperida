import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, toRecordId, withAdminDb } from '$lib/server/db';

const getJob = async (jobId: string, userId: string, role?: string) => {
	return withAdminDb((db) => {
		if (role === 'admin') {
			return queryOne(db, 'SELECT * FROM jobs WHERE id = type::record($id) LIMIT 1;', {
				id: jobId
			});
		}

		return queryOne(
			db,
			'SELECT * FROM jobs WHERE id = type::record($id) AND (website.owner = type::record($user) OR type::record($user) IN website.users) LIMIT 1;',
			{
				id: jobId,
				user: userId
			}
		);
	});
};

/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get a job by id
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
 *         description: Job details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const jobId = toRecordId('jobs', event.params.id);
	const job = await getJob(jobId, auth.user.id, auth.user.role);
	if (!job) return jsonError(event, 404, 'not_found', 'Job not found.');

	return jsonOk(event, { job });
};
