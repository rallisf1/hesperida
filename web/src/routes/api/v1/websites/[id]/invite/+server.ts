import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withAdminDb } from '$lib/server/db';
import {
	canInviteToWebsite,
	canManageInvitedRole,
	isAdmin,
	isSuperuser
} from '$lib/server/policy';
import { sendInviteSystemEmail } from '$lib/server/system-mail';
import { isSmtpConfigured, SMTP_NOT_CONFIGURED_MESSAGE } from '$lib/server/config';
import { normalizeRecordId } from '$lib/server/record-id';
import { createUniqueGroup } from '$lib/server/groups';
import { RecordId } from 'surrealdb';
import type { User, Website } from '$lib/types';
import { userRoles } from '$lib/constants';

type AppRole = User['role'];

const isUserRole = (value: string): value is AppRole => userRoles.includes(value);

/**
 * @swagger
 * /api/v1/websites/{id}/invite:
 *   post:
 *     tags: [Websites]
 *     summary: Invite member
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email: { type: string }
 *               role:
 *                 type: string
 *                 enum: [admin, editor, viewer]
 *     responses:
 *       200:
 *         description: User invited
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteInviteEnvelope'
 *       502:
 *         description: Notification delivery failed
 *       503:
 *         description: SMTP is not configured
 *       403:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;
	if (!isSmtpConfigured()) {
		return jsonError(event, 503, 'smtp_not_configured', SMTP_NOT_CONFIGURED_MESSAGE);
	}

	const websiteId = new RecordId('websites', event.params.id);

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
	const roleRaw = typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : '';
	if (!email || !roleRaw) {
		return jsonError(event, 400, 'bad_request', 'email and role are required.');
	}
	if (!isUserRole(roleRaw)) {
		return jsonError(event, 400, 'bad_request', 'role must be one of admin, editor, viewer.');
	}

	if (!canInviteToWebsite(auth.user)) {
		return jsonError(event, 403, 'forbidden', 'You are not allowed to invite users to this website.');
	}
	if (!canManageInvitedRole(auth.user, roleRaw)) {
		return jsonError(event, 403, 'forbidden', `You are not allowed to invite users with role '${roleRaw}'.`);
	}

	if (auth.user.email.trim().toLowerCase() === email) {
		return jsonError(event, 400, 'bad_request', 'You cannot invite yourself to a website.');
	}

	const website = await withAdminDb((db) =>
		queryOne<Website & { owner_group?: string }>(
			db,
			isSuperuser(auth.user)
				? 'SELECT id, owner, users, url, owner.group AS owner_group FROM websites WHERE id = $id LIMIT 1;'
				: isAdmin(auth.user)
					? 'SELECT id, owner, users, url, owner.group AS owner_group FROM websites WHERE id = $id AND (owner = $user OR $user IN users OR owner.group = $group) LIMIT 1;'
					: 'SELECT id, owner, users, url, owner.group AS owner_group FROM websites WHERE id = $id AND (owner = $user OR $user IN users) LIMIT 1;',
			{
				id: websiteId,
				user: auth.user.id,
				group: auth.user.group
			}
		)
	);
	if (!website) {
		return jsonError(event, 404, 'not_found', 'Website not found.');
	}

	let user = await withAdminDb((db) =>
		queryOne<User>(
			db,
			'SELECT id, email, forgot_token, role, `group`, is_superuser FROM users WHERE email = $email LIMIT 1;',
			{ email }
		)
	);

	let createdUserId: RecordId | null = null;
	let createdForgotToken: string | null = null;

	if (user) {
		if (!isSuperuser(auth.user) && user.group !== auth.user.group) {
			return jsonError(
				event,
				409,
				'cross_group_invite_forbidden',
				'Cannot invite users from a different group.'
			);
		}

		const websiteOwnerId = normalizeRecordId(website.owner);
		const websiteMemberIds = (website.users ?? []).map((member) => normalizeRecordId(member));
		const inviteeId = normalizeRecordId(user.id);
		if (inviteeId === websiteOwnerId || websiteMemberIds.includes(inviteeId)) {
			return jsonError(event, 400, 'bad_request', 'The user already has access to this website.');
		}

		if (user.is_superuser && roleRaw !== 'admin') {
			return jsonError(event, 400, 'bad_request', 'Superuser role cannot be downgraded.');
		}

		if (!user.is_superuser && user.role !== roleRaw) {
			if (roleRaw === 'viewer') {
					const ownedWebsites = await withAdminDb((db) =>
						queryOne<{ total_items: number }>(
							db,
							'SELECT count() AS total_items FROM websites WHERE owner = $id GROUP ALL;',
							{ id: user!.id }
						)
					);
				if (Number(ownedWebsites?.total_items ?? 0) > 0) {
					return jsonError(
						event,
						409,
						'owner_role_conflict',
						'Cannot set role to viewer for a user that owns websites.'
					);
				}
			}

			user = await withAdminDb((db) =>
				queryOne<User>(
						db,
						'UPDATE $id SET role = $role RETURN id, email, forgot_token, role, `group`, is_superuser;',
						{
							id: user!.id,
							role: roleRaw
						}
					)
				);
		}
	} else {
		const forgotToken = crypto.randomUUID();
		const randomPassword = crypto.randomUUID();
		const defaultName = email.split('@')[0] || 'invited-user';
		let invitedGroup = auth.user.group;
		if (isSuperuser(auth.user)) {
			try {
				invitedGroup = await createUniqueGroup();
			} catch (error) {
				return jsonError(event, 400, 'invite_failed', (error as Error).message);
			}
		}
		createdForgotToken = forgotToken;
		user = await withAdminDb((db) =>
			queryOne<User>(
				db,
				`CREATE users CONTENT {
					name: $name,
					email: $email,
					role: $role,
					password: crypto::argon2::generate($password),
					forgot_token: $forgotToken,
					\`group\`: $group,
					is_superuser: false
				} RETURN id, email, forgot_token, role, \`group\`, is_superuser;`,
				{
					name: defaultName,
					email,
					password: randomPassword,
					forgotToken,
					role: roleRaw,
					group: invitedGroup
				}
			)
		);
		createdUserId = user?.id ?? null;
	}

	if (!user) return jsonError(event, 400, 'invite_failed', 'Unable to invite user.');

	try {
		await sendInviteSystemEmail({
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
