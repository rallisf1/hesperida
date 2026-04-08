import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, toRecordId, withAdminDb } from '$lib/server/db';

const getWebsite = async (websiteId: string, userId: string, role?: string) => {
	return withAdminDb((db) => {
		if (role === 'admin') {
			return queryOne(db, 'SELECT * FROM websites WHERE id = type::record($id) LIMIT 1;', {
				id: websiteId
			});
		}

		return queryOne(
			db,
			'SELECT * FROM websites WHERE id = type::record($id) AND (owner = type::record($user) OR type::record($user) IN users) LIMIT 1;',
			{
				id: websiteId,
				user: userId
			}
		);
	});
};

/**
 * @swagger
 * /api/v1/websites/{id}:
 *   get:
 *     tags: [Websites]
 *     summary: Get a website by id
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
 *         description: Website details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const websiteId = toRecordId('websites', event.params.id);
	const website = await getWebsite(websiteId, auth.user.id, auth.user.role);
	if (!website) return jsonError(event, 404, 'not_found', 'Website not found.');

	return jsonOk(event, { website });
};

/**
 * @swagger
 * /api/v1/websites/{id}:
 *   patch:
 *     tags: [Websites]
 *     summary: Update a website
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url: { type: string }
 *               description: { type: string }
 *               verified: { type: boolean }
 *     responses:
 *       200:
 *         description: Website updated
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const PATCH: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const websiteId = toRecordId('websites', event.params.id);
	const existing = await getWebsite(websiteId, auth.user.id, auth.user.role);
	if (!existing) return jsonError(event, 404, 'not_found', 'Website not found.');

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const patch: Record<string, unknown> = {};
	if (typeof payload.url === 'string') patch.url = payload.url.trim();
	if (typeof payload.description === 'string') patch.description = payload.description.trim();
	if (typeof payload.verified === 'boolean') patch.verified = payload.verified;

	if (!Object.keys(patch).length) {
		return jsonError(event, 400, 'bad_request', 'At least one updatable field is required (url, description, verified).');
	}

	try {
		const website = await withAdminDb((db) =>
			queryOne(db, 'UPDATE $id MERGE $patch RETURN AFTER;', { id: websiteId, patch })
		);
		return jsonOk(event, { website });
	} catch (error) {
		return jsonError(event, 400, 'update_failed', (error as Error).message);
	}
};

/**
 * @swagger
 * /api/v1/websites/{id}:
 *   delete:
 *     tags: [Websites]
 *     summary: Delete a website
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
 *         description: Website deleted
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const DELETE: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const websiteId = toRecordId('websites', event.params.id);
	const existing = await getWebsite(websiteId, auth.user.id, auth.user.role);
	if (!existing) return jsonError(event, 404, 'not_found', 'Website not found.');

	await withAdminDb((db) => db.query('DELETE $id;', { id: websiteId }).collect());
	return jsonOk(event, { deleted: true });
};
