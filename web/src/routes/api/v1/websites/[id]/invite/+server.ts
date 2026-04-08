import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, toRecordId, withAdminDb } from '$lib/server/db';
import { canInviteToWebsite, isAdmin } from '$lib/server/policy';

type WebsiteAccessRow = {
	id: string;
	owner: unknown;
	users?: unknown[];
};

/**
 * @swagger
 * /api/v1/websites/{id}/invite:
 *   post:
 *     tags: [Websites]
 *     summary: Invite a user to a website by email
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
 *         description: User invited
 *       403:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const websiteId = toRecordId('websites', event.params.id);

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
	if (!email) return jsonError(event, 400, 'bad_request', 'email is required.');

	if (!canInviteToWebsite(auth.user)) {
		return jsonError(event, 403, 'forbidden', 'You are not allowed to invite users to this website.');
	}

	const website = await withAdminDb((db) =>
		queryOne<WebsiteAccessRow>(
			db,
			isAdmin(auth.user)
				? 'SELECT id, owner, users FROM websites WHERE id = type::record($id) LIMIT 1;'
				: 'SELECT id, owner, users FROM websites WHERE id = type::record($id) AND (owner = type::record($user) OR type::record($user) IN users) LIMIT 1;',
			{
				id: websiteId,
				user: auth.user.id
			}
		)
	);
	if (!website) {
		return jsonError(event, isAdmin(auth.user) ? 404 : 403, isAdmin(auth.user) ? 'not_found' : 'forbidden', isAdmin(auth.user) ? 'Website not found.' : 'You are not allowed to invite users to this website.');
	}

	let user = await withAdminDb((db) =>
		queryOne<{ id: string; email: string }>(db, 'SELECT id, email FROM users WHERE email = $email LIMIT 1;', { email })
	);

	if (!user) {
		const forgotToken = crypto.randomUUID();
		const randomPassword = crypto.randomUUID();
		const defaultName = email.split('@')[0] || 'invited-user';
		user = await withAdminDb((db) =>
			queryOne<{ id: string; email: string }>(
				db,
				`CREATE users CONTENT {
					name: $name,
					email: $email,
					role: 'viewer',
					password: crypto::argon2::generate($password),
					forgot_token: $forgotToken
				} RETURN id, email;`,
				{ name: defaultName, email, password: randomPassword, forgotToken }
			)
		);
		// TODO: Send invite notification with onboarding/password setup instructions.
	}

	if (!user) return jsonError(event, 400, 'invite_failed', 'Unable to invite user.');

	const updated = await withAdminDb((db) =>
		queryOne<WebsiteAccessRow>(
			db,
			'UPDATE websites SET users = array::distinct(array::append(users ?? [], type::record($userId))) WHERE id = type::record($id) RETURN AFTER;',
			{
				id: websiteId,
				userId: user.id
			}
		)
	);

	return jsonOk(event, { website: updated, invited_user: user });
};
