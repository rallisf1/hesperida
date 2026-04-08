import type { RequestHandler } from './$types';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryMany, queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { canCreateWebsite, isAdmin } from '$lib/server/policy';
import { withRequiredUser } from '$lib/server/route';

/**
 * @swagger
 * /api/v1/websites:
 *   get:
 *     tags: [Websites]
 *     summary: List websites for the current user
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Website list
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (isAdmin(auth.user)) {
			const rows = await withAdminDb((db) => queryMany(db, 'SELECT * FROM websites ORDER BY created_at DESC;'));
			return jsonOk(event, { websites: rows ?? [] });
		}

		const rows = await withUserDb(auth.token, (db) => queryMany(db, 'SELECT * FROM websites ORDER BY created_at DESC;'));
		return jsonOk(event, { websites: rows ?? [] });
	});
};

/**
 * @swagger
 * /api/v1/websites:
 *   post:
 *     tags: [Websites]
 *     summary: Create a website
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, description]
 *             properties:
 *               url: { type: string }
 *               description: { type: string }
 *               verified: { type: boolean }
 *     responses:
 *       201:
 *         description: Website created
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (!canCreateWebsite(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Viewer users cannot create websites.');
		}

		let payload: Record<string, unknown>;
		try {
			payload = await parseJson(event.request);
		} catch (error) {
			return jsonError(event, 400, 'bad_request', (error as Error).message);
		}

		const url = typeof payload.url === 'string' ? payload.url.trim() : '';
		const description = typeof payload.description === 'string' ? payload.description.trim() : '';
		const verified = typeof payload.verified === 'boolean' ? payload.verified : false;

		if (!url || !description) {
			return jsonError(event, 400, 'bad_request', 'url and description are required.');
		}

		try {
			const website = await withAdminDb((db) =>
				queryOne(
					db,
					'CREATE websites CONTENT { owner: type::record($user), users: [type::record($user)], url: $url, description: $description, verified: $verified } RETURN AFTER;',
					{ user: auth.user.id, url, description, verified }
				)
			);

			return jsonOk(event, { website }, 201);
		} catch (error) {
			return jsonError(event, 400, 'create_failed', (error as Error).message);
		}
	});
};
