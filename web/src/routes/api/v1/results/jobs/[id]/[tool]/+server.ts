import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, toRecordId, withAdminDb } from '$lib/server/db';

const TOOLS = new Set(['probe', 'seo', 'ssl', 'wcag', 'whois', 'domain', 'security', 'stress']);

const fetchResult = async (db: any, value: unknown): Promise<unknown> => {
	if (!value) return null;
	if (Array.isArray(value)) {
		const rows = await Promise.all(value.map((id) => db.select(id as string)));
		return rows;
	}
	return db.select(value as string);
};

/**
 * @swagger
 * /api/v1/results/jobs/{id}/{tool}:
 *   get:
 *     tags: [Results]
 *     summary: Get a specific tool result for a job
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: tool
 *         required: true
 *         schema:
 *           type: string
 *           enum: [probe, seo, ssl, wcag, whois, domain, security, stress]
 *     responses:
 *       200:
 *         description: Tool result
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const tool = event.params.tool;
	if (!TOOLS.has(tool)) return jsonError(event, 404, 'not_found', 'Unknown tool.');

	const jobId = toRecordId('jobs', event.params.id);
	const job = await withAdminDb((db) =>
		queryOne<Record<string, unknown>>(
			db,
			auth.user.role === 'admin'
				? 'SELECT * FROM jobs WHERE id = type::record($id) LIMIT 1;'
				: 'SELECT * FROM jobs WHERE id = type::record($id) AND (website.owner = type::record($user) OR type::record($user) IN website.users) LIMIT 1;',
			{
				id: jobId,
				user: auth.user.id
			}
		)
	);
	if (!job) return jsonError(event, 404, 'not_found', 'Job not found.');

	const value = job[tool];
	const result = await withAdminDb((db) => fetchResult(db, value));
	return jsonOk(event, { tool, result });
};
