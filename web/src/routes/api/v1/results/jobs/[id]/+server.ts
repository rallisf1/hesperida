import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, toRecordId, withAdminDb } from '$lib/server/db';

/**
 * @swagger
 * /api/v1/results/jobs/{id}:
 *   get:
 *     tags: [Results]
 *     summary: Get aggregated results for a job
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
 *         description: Aggregated results
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const jobId = toRecordId('jobs', event.params.id);

	const job = await withAdminDb((db) =>
		queryOne(
			db,
			auth.user.role === 'admin'
				? 'SELECT * FROM jobs WHERE id = type::record($id) LIMIT 1 FETCH probe, seo, ssl, whois, wcag, domain, security, stress;'
				: 'SELECT * FROM jobs WHERE id = type::record($id) AND (website.owner = type::record($user) OR type::record($user) IN website.users) LIMIT 1 FETCH probe, seo, ssl, whois, wcag, domain, security, stress;',
			{ id: jobId, user: auth.user.id }
		)
	);
	if (!job) return jsonError(event, 404, 'not_found', 'Job not found.');

	return jsonOk(event, { job });
};
