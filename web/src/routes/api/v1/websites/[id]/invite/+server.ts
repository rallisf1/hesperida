import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withAdminDb } from '$lib/server/db';
import { canInviteToWebsite, isAdmin } from '$lib/server/policy';
import { sendInviteNotification } from '$lib/server/notifications';
import { RecordId } from 'surrealdb';
import type { User, Website } from '$lib/types';

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
 *       502:
 *         description: Notification delivery failed
 *       403:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const websiteId = new RecordId('websites', event.params.id);

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

	if (auth.user.email === email) {
		return jsonError(event, 400, 'bad_request', 'You cannot invite yourself to a website.');
	}

	const website = await withAdminDb((db) =>
		queryOne<Website>(
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
		return jsonError(event, isAdmin(auth.user) ? 404 : 403, isAdmin(auth.user) ? 'not_found' : 'forbidden', isAdmin(auth.user) ? 'Website not found.' : 'You are not allowed to invite users to this website.');
	}

	let user = await withAdminDb((db) =>
		queryOne<User>(
			db,
			'SELECT id, email, forgot_token FROM users WHERE email = $email LIMIT 1;',
			{ email }
		)
	);

	let createdUserId: RecordId | null = null;
	let createdForgotToken: string | null = null;

	if (user) {
		if(user.id === website.owner || website.users.includes(user.id!)) {
			return jsonError(event, 400, 'bad_request', 'The user already has access to this website.');
		}
	} else {
		const forgotToken = crypto.randomUUID();
		const randomPassword = crypto.randomUUID();
		const defaultName = email.split('@')[0] || 'invited-user';
		createdForgotToken = forgotToken;
		user = await withAdminDb((db) =>
			queryOne<User>(
				db,
				`CREATE users CONTENT {
					name: $name,
					email: $email,
					role: 'viewer',
					password: crypto::argon2::generate($password),
					forgot_token: $forgotToken
				} RETURN id, email, forgot_token;`,
				{
					name: defaultName,
					email,
					password: randomPassword,
					forgotToken
				}
			)
		);
		createdUserId = user?.id ?? null;
	}

	if (!user) return jsonError(event, 400, 'invite_failed', 'Unable to invite user.');

	try {
		await sendInviteNotification({
			email: user.email,
			websiteUrl: website.url,
			inviterName: auth.user.name || auth.user.email,
			isNewUser: !!createdUserId,
			forgotToken: createdForgotToken ?? undefined
		});
	} catch (error) {
		if (createdUserId) {
			await withAdminDb((db) => db.query('DELETE $id;', { id: createdUserId }).collect());
		}
		return jsonError(event, 502, 'notification_failed', (error as Error).message);
	}

	const updated = await withAdminDb((db) =>
		queryOne<Website>(
			db,
			'UPDATE websites SET users = array::distinct(array::append(users ?? [], $userId)) WHERE id = $id RETURN AFTER;',
			{
				id: websiteId,
				userId: user.id
			}
		)
	);
	if (!updated) {
		if (createdUserId) {
			await withAdminDb((db) => db.query('DELETE $id;', { id: createdUserId }).collect());
		}
		return jsonError(event, 400, 'invite_failed', 'Unable to update website members.');
	}

	return jsonOk(event, { website: updated, invited_user: user });
};
