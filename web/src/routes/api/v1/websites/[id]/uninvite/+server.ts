import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withAdminDb } from '$lib/server/db';
import { canInviteToWebsite, isAdmin } from '$lib/server/policy';
import { normalizeRecordId } from '$lib/server/record-id';
import { RecordId } from 'surrealdb';
import type { User, Website } from '$lib/types';

/**
 * @swagger
 * /api/v1/websites/{id}/uninvite:
 *   post:
 *     tags: [Websites]
 *     summary: Remove a user's access to a website by email
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200:
 *         description: User access removed
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	if (!canInviteToWebsite(auth.user)) {
		return jsonError(event, 403, 'forbidden', 'You are not allowed to uninvite users from this website.');
	}

	const routeId = event.params.id;
	if (!routeId) return jsonError(event, 400, 'bad_request', 'Website id is required.');
	const websiteId = new RecordId('websites', routeId);

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
	if (!email) return jsonError(event, 400, 'bad_request', 'email is required.');

	const website = await withAdminDb((db) =>
		queryOne<Partial<Website>>(
			db,
			isAdmin(auth.user)
				? 'SELECT id, owner, users, url FROM websites WHERE id = $id LIMIT 1;'
				: 'SELECT id, owner, users, url FROM websites WHERE id = $id AND (owner = $user OR $user IN users) LIMIT 1;',
			{
				id: websiteId,
				user: auth.user.id
			}
		)
	);
	if (!website) {
		return jsonError(
			event,
			isAdmin(auth.user) ? 404 : 403,
			isAdmin(auth.user) ? 'not_found' : 'forbidden',
			isAdmin(auth.user)
				? 'Website not found.'
				: 'You are not allowed to uninvite users from this website.'
		);
	}

	const user = await withAdminDb((db) =>
		queryOne<Partial<User>>(db, 'SELECT id, email FROM users WHERE email = $email LIMIT 1;', { email })
	);
	if (!user) return jsonError(event, 404, 'not_found', 'User not found.');

	const currentUsers = (website.users ?? []).map((entry) => normalizeRecordId(entry));
	if (!currentUsers.includes(normalizeRecordId(user.id))) {
		return jsonOk(event, { website, removed: false });
	}

	const updated = await withAdminDb((db) =>
		queryOne<Partial<Website>>(
			db,
			'UPDATE websites SET users = array::filter(users ?? [], |$u| $u != $userId) WHERE id = $id RETURN AFTER;',
			{ id: websiteId, userId: user.id }
		)
	);

	if (!updated) {
		return jsonError(event, 400, 'uninvite_failed', 'Unable to update website members.');
	}

	return jsonOk(event, { website: updated, removed: true });
};
