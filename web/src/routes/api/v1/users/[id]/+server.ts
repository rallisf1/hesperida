import type { RequestHandler } from './$types';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withAdminDb } from '$lib/server/db';
import { withRequiredUser } from '$lib/server/route';
import { isAdmin, isSuperuser } from '$lib/server/policy';
import { normalizeRecordId } from '$lib/server/record-id';
import { createUniqueGroup } from '$lib/server/groups';
import { RecordId } from 'surrealdb';
import type { User } from '$lib/types';
import { userRoles } from '$lib/constants';

const isUserRole = (value: string): value is User["role"] =>
	userRoles.includes(value);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user
 *     description: Admin-only, except users can read their own record.
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
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserEnvelope'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Users]
 *     summary: Update user
 *     description: Admin-only, except users can update their own basic profile fields.
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
 *               name: { type: string }
 *               email: { type: string }
 *               role:
 *                 type: string
 *                 enum: [admin, editor, viewer]
 *               group:
 *                 type: string
 *                 description: Superuser-only. Send an empty string to generate a new unique group id.
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserEnvelope'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *   delete:
 *     tags: [Users]
 *     summary: Delete user
 *     description: Admin-only
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
 *         description: User deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteEnvelope'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: User owns websites and cannot be deleted
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const userId = new RecordId('users', event.params.id);
		const isSelf = normalizeRecordId(auth.user.id) === normalizeRecordId(userId);
		if (!isAdmin(auth.user) && !isSelf) {
			return jsonError(event, 403, 'forbidden', 'Only admin users can view users.');
		}

		const user = await withAdminDb((db) =>
			queryOne(
				db,
				isSuperuser(auth.user)
					? 'SELECT id, name, email, role, `group`, is_superuser, created_at FROM users WHERE id = $id LIMIT 1;'
					: isAdmin(auth.user)
						? 'SELECT id, name, email, role, `group`, is_superuser, created_at FROM users WHERE id = $id AND `group` = $group LIMIT 1;'
					: 'SELECT id, name, email, role, `group`, is_superuser, created_at FROM users WHERE id = $id AND `group` = $group LIMIT 1;',
				{ id: userId, group: auth.user.group }
			)
		);

		if (!user) return jsonError(event, 404, 'not_found', 'User not found.');
		return jsonOk(event, { user });
	});
};

export const PATCH: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const userId = new RecordId('users', event.params.id);
		const isSelf = normalizeRecordId(auth.user.id) === normalizeRecordId(userId);
		if (!isAdmin(auth.user) && !isSelf) {
			return jsonError(event, 403, 'forbidden', 'Only admin users can update users.');
		}

		let payload: Record<string, unknown>;
		try {
			payload = await parseJson(event.request);
		} catch (error) {
			return jsonError(event, 400, 'bad_request', (error as Error).message);
		}

		const patch: Record<string, unknown> = {};
		if (typeof payload.name === 'string') patch.name = payload.name.trim();
		if (typeof payload.email === 'string') patch.email = payload.email.trim().toLowerCase();
		if (typeof payload.role === 'string') {
			const role = payload.role.trim().toLowerCase();
			if (!isUserRole(role)) {
				return jsonError(event, 400, 'bad_request', 'role must be one of admin, editor, viewer.');
			}
			patch.role = role;
		}

		try {
			let targetUser: { is_superuser?: boolean; group?: string; role?: string } | null = null;
			if (!isSuperuser(auth.user)) {
				const allowed = await withAdminDb((db) =>
					queryOne<{ id?: string }>(
						db,
						'SELECT id FROM users WHERE id = $id AND `group` = $group LIMIT 1;',
						{ id: userId, group: auth.user.group }
					)
				);
				if (!allowed?.id && !isSelf) return jsonError(event, 404, 'not_found', 'User not found.');
			}

			if (typeof payload.group === 'string' || patch.role || isSelf) {
				targetUser = await withAdminDb((db) =>
					queryOne<{ is_superuser?: boolean; group?: string; role?: string }>(
						db,
						'SELECT is_superuser, `group`, role FROM users WHERE id = $id LIMIT 1;',
						{ id: userId }
					)
				);
				if (!targetUser) return jsonError(event, 404, 'not_found', 'User not found.');
			}

			// Non-admin self updates can only keep role/group unchanged.
			if (!isAdmin(auth.user) && isSelf) {
				if (typeof payload.group === 'string') {
					const submittedGroup = payload.group.trim();
					if (submittedGroup !== (targetUser?.group ?? '')) {
						return jsonError(
							event,
							403,
							'forbidden',
							'Only superuser can change user groups.'
						);
					}
				}
				if (typeof payload.role === 'string') {
					const submittedRole = payload.role.trim().toLowerCase();
					if (submittedRole !== (targetUser?.role ?? '').toLowerCase()) {
						return jsonError(
							event,
							403,
							'forbidden',
							'Only admin users can update user roles.'
						);
					}
					delete patch.role;
				}
			}

			if (typeof payload.group === 'string') {
				const submittedGroup = payload.group.trim();
				const currentGroup = targetUser?.group ?? '';
				const wantsGroupChange = submittedGroup === '' || submittedGroup !== currentGroup;

				if (wantsGroupChange) {
					if (!isSuperuser(auth.user)) {
						return jsonError(event, 403, 'forbidden', 'Only superuser can change user groups.');
					}
					if (normalizeRecordId(auth.user.id) === normalizeRecordId(userId)) {
						return jsonError(event, 400, 'bad_request', 'You cannot change your own group.');
					}
					if (targetUser?.is_superuser) {
						return jsonError(event, 400, 'bad_request', 'Cannot change superuser group.');
					}

					if (!submittedGroup) {
						try {
							patch.group = await createUniqueGroup();
						} catch (error) {
							return jsonError(event, 400, 'update_failed', (error as Error).message);
						}
					} else {
						patch.group = submittedGroup;
					}
				}
			}

			if (!Object.keys(patch).length) {
				return jsonError(
					event,
					400,
					'bad_request',
					'At least one field is required (name, email, role, group).'
				);
			}

			if (patch.role && targetUser?.is_superuser && patch.role !== 'admin') {
				return jsonError(
					event,
					400,
					'bad_request',
					'Superuser accounts can only have the admin role.'
				);
			}

			if (patch.role === 'viewer') {
				const ownedWebsites = await withAdminDb((db) =>
					queryOne<{ total_items: number }>(
						db,
						'SELECT count() AS total_items FROM websites WHERE owner = $id GROUP ALL;',
						{ id: userId }
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

			const updated = await withAdminDb((db) =>
				queryOne(
					db,
					'UPDATE $id MERGE $patch RETURN id, name, email, role, `group`, is_superuser, created_at;',
					{ id: userId, patch }
				)
			);
			if (!updated) return jsonError(event, 404, 'not_found', 'User not found.');
			return jsonOk(event, { user: updated });
		} catch (error) {
			return jsonError(event, 400, 'update_failed', (error as Error).message);
		}
	});
};

export const DELETE: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (!isAdmin(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Only admin users can delete users.');
		}

		const userId = new RecordId('users', event.params.id);
		const existing = await withAdminDb((db) =>
			queryOne<{ id: string; is_superuser?: boolean }>(
				db,
				isSuperuser(auth.user)
					? 'SELECT id, is_superuser FROM users WHERE id = $id LIMIT 1;'
					: 'SELECT id, is_superuser FROM users WHERE id = $id AND `group` = $group LIMIT 1;',
				{ id: userId, group: auth.user.group }
			)
		);
		if (!existing) return jsonError(event, 404, 'not_found', 'User not found.');
		if (existing.is_superuser) {
			return jsonError(event, 403, 'forbidden', 'Superuser accounts cannot be deleted.');
		}
		if (normalizeRecordId(existing.id) === normalizeRecordId(auth.user.id)) {
			return jsonError(
				event,
				400,
				'bad_request',
				'Use /api/v1/users/me to manage your own account.'
			);
		}

		const ownedWebsites = await withAdminDb((db) =>
			queryOne<{ total_items: number }>(
				db,
				'SELECT count() AS total_items FROM websites WHERE owner = $id GROUP ALL;',
				{ id: userId }
			)
		);
		if (Number(ownedWebsites?.total_items ?? 0) > 0) {
			return jsonError(
				event,
				409,
				'cannot_delete_owner',
				'Cannot delete this user because they own one or more websites.'
			);
		}

		await withAdminDb((db) => db.query('DELETE $id;', { id: userId }).collect());
		return jsonOk(event, { deleted: true });
	});
};
