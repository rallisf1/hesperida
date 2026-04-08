import type { RequestHandler } from './$types';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryMany, queryOne, toRecordId, withAdminDb, withUserDb } from '$lib/server/db';
import { canCreateJob, isAdmin } from '$lib/server/policy';
import { withRequiredUser } from '$lib/server/route';
type Tool = 'probe' | 'seo' | 'ssl' | 'wcag' | 'whois' | 'domain' | 'security' | 'stress';
const ALLOWED_TOOLS: Tool[] = ['probe', 'seo', 'ssl', 'wcag', 'whois', 'domain', 'security', 'stress'];

/**
 * @swagger
 * /api/v1/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: List jobs for the current user
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Job list
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (isAdmin(auth.user)) {
			const rows = await withAdminDb((db) => queryMany(db, 'SELECT * FROM jobs ORDER BY created_at DESC;'));
			return jsonOk(event, { jobs: rows ?? [] });
		}
		const rows = await withUserDb(auth.token, (db) => queryMany(db, 'SELECT * FROM jobs ORDER BY created_at DESC;'));
		return jsonOk(event, { jobs: rows ?? [] });
	});
};

/**
 * @swagger
 * /api/v1/jobs:
 *   post:
 *     tags: [Jobs]
 *     summary: Create a new scan job
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [website, types]
 *             properties:
 *               website: { type: string }
 *               types:
 *                 type: array
 *                 items: { type: string }
 *               options: { type: object }
 *     responses:
 *       201:
 *         description: Job created
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (!canCreateJob(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Viewer users cannot create jobs.');
		}

		let payload: Record<string, unknown>;
		try {
			payload = await parseJson(event.request);
		} catch (error) {
			return jsonError(event, 400, 'bad_request', (error as Error).message);
		}

		const website = typeof payload.website === 'string' ? toRecordId('websites', payload.website) : '';
		const types = Array.isArray(payload.types) ? payload.types.filter((item): item is Tool => typeof item === 'string' && ALLOWED_TOOLS.includes(item as Tool)) : [];
		const options = payload.options && typeof payload.options === 'object' && !Array.isArray(payload.options) ? payload.options : null;

		if (!website) return jsonError(event, 400, 'bad_request', 'website is required.');
		if (!types.length) return jsonError(event, 400, 'bad_request', 'types must include at least one valid tool.');

		const websiteRow = await withAdminDb((db) =>
			queryOne(
				db,
				isAdmin(auth.user)
					? 'SELECT id FROM websites WHERE id = type::record($id) LIMIT 1;'
					: 'SELECT id FROM websites WHERE id = type::record($id) AND (owner = type::record($user) OR type::record($user) IN users) LIMIT 1;',
				{
					id: website,
					user: auth.user.id
				}
			)
		);
		if (!websiteRow) return jsonError(event, 404, 'not_found', 'Website not found.');

		try {
			const job = await withAdminDb((db) => {
				if (options) {
					return queryOne(
						db,
						'CREATE jobs CONTENT { website: type::record($website), types: $types, status: "pending", options: $options } RETURN AFTER;',
						{ website, types, options }
					);
				}

				return queryOne(
					db,
					'CREATE jobs CONTENT { website: type::record($website), types: $types, status: "pending" } RETURN AFTER;',
					{ website, types }
				);
			});

			return jsonOk(event, { job }, 201);
		} catch (error) {
			return jsonError(event, 400, 'create_failed', (error as Error).message);
		}
	});
};
