import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, toRecordId, withAdminDb, withUserDb } from '$lib/server/db';
import { isAdmin } from '$lib/server/policy';
import { tools } from '$lib/constants';
import type { Tool } from '$lib/types';

const TOOLS = new Set<Tool>(tools);

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

	const tool = event.params.tool as Tool;
	if (!TOOLS.has(tool)) return jsonError(event, 404, 'not_found', 'Unknown tool.');

	const jobId = toRecordId('jobs', event.params.id);
	const jobSql = 'SELECT * FROM jobs WHERE id = type::record($id) LIMIT 1;';
	const job = isAdmin(auth.user)
		? await withAdminDb((db) => queryOne<Record<string, unknown>>(db, jobSql, { id: jobId }))
		: await withUserDb(auth.token, (db) => queryOne<Record<string, unknown>>(db, jobSql, { id: jobId }));
	if (!job) return jsonError(event, 404, 'not_found', 'Job not found.');

	const value = job[tool];
	const result = isAdmin(auth.user)
		? await withAdminDb((db) => fetchResult(db, value))
		: await withUserDb(auth.token, (db) => fetchResult(db, value));
	return jsonOk(event, { tool, result });
};
