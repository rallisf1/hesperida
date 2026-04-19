import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withAdminDb } from '$lib/server/db';
import { normalizeRecordId, toRouteId } from '$lib/server/record-id';
import { sendInviteSystemEmail } from '$lib/server/system-mail';
import { isSmtpConfigured, SMTP_NOT_CONFIGURED_MESSAGE } from '$lib/server/config';
import { isSuperuser } from '$lib/server/policy';
import { createUniqueGroup } from '$lib/server/groups';
import { RecordId } from 'surrealdb';
import type { User, Website } from '$lib/types';

/**
 * @swagger
 * /api/v1/websites/{id}/transfer-ownership:
 *   post:
 *     tags: [Websites]
 *     summary: Transfer ownership
 *     description: Owner-only. The recipient cannot be an existing viewer.
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
 *               keep_previous_owner_access: { type: boolean, default: true }
 *     responses:
 *       200:
 *         description: Ownership transferred
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteTransferOwnershipEnvelope'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       502:
 *         description: Notification delivery failed
 *       503:
 *         description: SMTP is not configured
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
	const keepPreviousOwnerAccess =
		typeof payload.keep_previous_owner_access === 'boolean'
			? payload.keep_previous_owner_access
			: true;

	if (!email) return jsonError(event, 400, 'bad_request', 'email is required.');

	const website = await withAdminDb((db) =>
		queryOne<Website & { owner_group?: string }>(
			db,
			'SELECT id, owner, users, url, owner.group AS owner_group FROM websites WHERE id = $id LIMIT 1;',
			{
				id: websiteId
			}
		)
	);
	if (!website) return jsonError(event, 404, 'not_found', 'Website not found.');

	if (normalizeRecordId(website.owner) !== normalizeRecordId(auth.user.id)) {
		return jsonError(
			event,
			403,
			'forbidden',
			'Only the current website owner can transfer ownership.'
		);
	}

	const ownerUser = await withAdminDb((db) =>
		queryOne<User>(
			db,
			'SELECT id, name, email, `group` FROM users WHERE id = $id LIMIT 1;',
			{
				id: website.owner
			}
		)
	);
	if (!ownerUser) return jsonError(event, 404, 'not_found', 'Owner user not found.');

	if (ownerUser.email.trim().toLowerCase() === email) {
		return jsonError(event, 400, 'bad_request', 'You cannot transfer ownership to yourself.');
	}

	let user = await withAdminDb((db) =>
		queryOne<User>(
			db,
			'SELECT id, email, forgot_token, role, `group`, is_superuser FROM users WHERE email = $email LIMIT 1;',
			{
				email
			}
		)
	);

	let createdUserId: RecordId | null = null;
	let createdForgotToken: string | null = null;

	if (!user) {
		const forgotToken = crypto.randomUUID();
		const randomPassword = crypto.randomUUID();
		const defaultName = email.split('@')[0] || 'invited-user';
		createdForgotToken = forgotToken;
		let targetGroup = ownerUser.group;
		if (isSuperuser(auth.user)) {
			try {
				targetGroup = await createUniqueGroup();
			} catch (error) {
				return jsonError(event, 400, 'transfer_failed', (error as Error).message);
			}
		}

		user = await withAdminDb((db) =>
			queryOne<User>(
				db,
				`CREATE users CONTENT {
					name: $name,
					email: $email,
					role: 'editor',
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
					group: targetGroup
				}
			)
		);
		createdUserId = user?.id ?? null;
	} else {
		if (user.group !== ownerUser.group) {
			return jsonError(
				event,
				409,
				'cross_group_transfer_forbidden',
				'Cannot transfer ownership to a user from a different group.'
			);
		}

		if (user.role === 'viewer') {
			user = await withAdminDb((db) =>
				queryOne<User>(
						db,
						'UPDATE $id SET role = "editor" RETURN id, email, forgot_token, role, `group`, is_superuser;',
						{
							id: user!.id
						}
					)
				);
		}
	}

	if (!user) return jsonError(event, 400, 'transfer_failed', 'Unable to resolve target user.');

	try {
		await sendInviteSystemEmail({
			email: user.email,
			websiteUrl: website.url,
			inviterName: ownerUser.name || ownerUser.email,
			isNewUser: !!createdUserId,
			forgotToken: createdForgotToken ?? undefined
		});
	} catch (error) {
		if (createdUserId) {
			await withAdminDb((db) => db.query('DELETE $id;', { id: createdUserId }).collect());
		}
		return jsonError(event, 502, 'notification_failed', (error as Error).message);
	}

	const oldOwnerId = normalizeRecordId(website.owner);
	const targetUserId = normalizeRecordId(user.id);
	const memberSet = new Set((website.users ?? []).map((entry) => normalizeRecordId(entry)));
	memberSet.delete(targetUserId);

	if (keepPreviousOwnerAccess) {
		memberSet.add(oldOwnerId);
	} else {
		memberSet.delete(oldOwnerId);
	}

	const updatedMembers = Array.from(memberSet).map(
		(memberId) => new RecordId('users', toRouteId(memberId))
	);

	const updated = await withAdminDb((db) =>
		queryOne<Website>(
			db,
			'UPDATE websites SET owner = $owner, users = $users WHERE id = $id RETURN AFTER;',
			{
				id: websiteId,
				owner: user.id,
				users: updatedMembers
			}
		)
	);

	if (!updated) {
		if (createdUserId) {
			await withAdminDb((db) => db.query('DELETE $id;', { id: createdUserId }).collect());
		}
		return jsonError(event, 400, 'transfer_failed', 'Unable to transfer website ownership.');
	}

	return jsonOk(event, {
		website: updated,
		new_owner: user,
		keep_previous_owner_access: keepPreviousOwnerAccess
	});
};
