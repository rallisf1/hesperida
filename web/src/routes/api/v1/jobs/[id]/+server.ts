import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { getJob } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';

/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get job
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobEnvelope'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const jobId = new RecordId('jobs', event.params.id);
	const job = await getJob(jobId, auth.token, isSuperuser(auth.user));
	if (!job) return jsonError(event, 404, 'not_found', 'Job not found.');

	return jsonOk(event, { job });
};
