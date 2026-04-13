import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isAdmin } from '$lib/server/policy';
import type { Website } from '$lib/types';
import { RecordId } from 'surrealdb';

const getWebsite = async (websiteId: RecordId, token: string, role?: string) => {
	if (role === 'admin') {
		return withAdminDb((db) => queryOne<Website>(db, 'SELECT * FROM websites WHERE id = $id LIMIT 1;', { id: websiteId }));
	}
	return withUserDb(token, (db) => queryOne<Website>(db, 'SELECT * FROM websites WHERE id = $id LIMIT 1;', { id: websiteId }));
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

	const websiteId = new RecordId('websites', event.params.id);
	const website = await getWebsite(websiteId, auth.token, auth.user.role);
	if (!website) return jsonError(event, 404, 'not_found', 'Website not found.');

	return jsonOk(event, { website });
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

	const websiteId = new RecordId('websites', event.params.id);
	const existing = await getWebsite(websiteId, auth.token, auth.user.role);
	if (!existing) return jsonError(event, 404, 'not_found', 'Website not found.');

	await (isAdmin(auth.user)
		? withAdminDb((db) => db.query('DELETE $id;', { id: websiteId }).collect())
		: withUserDb(auth.token, (db) => db.query('DELETE $id;', { id: websiteId }).collect()));
	return jsonOk(event, { deleted: true });
};
