import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import type { User, Website } from '$lib/types';
import { RecordId } from 'surrealdb';

const getWebsite = async (websiteId: RecordId, token: string, role?: string) => {
	if (role === 'admin') {
		return withAdminDb((db) =>
			queryOne<Website>(db, 'SELECT * FROM websites WHERE id = $id LIMIT 1;', { id: websiteId })
		);
	}
	return withUserDb(token, (db) =>
		queryOne<Website>(db, 'SELECT * FROM websites WHERE id = $id LIMIT 1;', { id: websiteId })
	);
};

/**
 * @swagger
 * /api/v1/websites/{id}/members:
 *   get:
 *     tags: [Websites]
 *     summary: Get owner/member user profiles for a website
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
 *         description: Website member details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const websiteId = new RecordId('websites', event.params.id);
	const website = await getWebsite(websiteId, auth.token, auth.user.role);
	if (!website) return jsonError(event, 404, 'not_found', 'Website not found.');

	const owner = await withAdminDb((db) =>
		db.select<Partial<User>>(website.owner).fields('id', 'name', 'email', 'role')
	);
	const [users] = website.users.length
		? await withAdminDb((db) =>
				db
					.query<Partial<User>[][]>(
						'SELECT id, name, email, role FROM users WHERE id in $ids',
						{ ids: website.users }
					)
					.collect()
			)
		: [[]];

	return jsonOk(event, { owner_user: owner, member_users: users ?? [] });
};

