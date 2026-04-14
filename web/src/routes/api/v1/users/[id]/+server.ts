import type { RequestHandler } from './$types';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withAdminDb } from '$lib/server/db';
import { withRequiredUser } from '$lib/server/route';
import { isAdmin, isSuperuser } from '$lib/server/policy';
import { normalizeRecordId } from '$lib/server/record-id';
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
 *     summary: Get a user by id (admin only)
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *   patch:
 *     tags: [Users]
 *     summary: Update a user (admin only)
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user (admin only)
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: User deleted
 *       409:
 *         description: User owns websites and cannot be deleted
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (!isAdmin(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Only admin users can view users.');
		}

		const userId = new RecordId('users', event.params.id);
		const user = await withAdminDb((db) =>
			queryOne(
				db,
				isSuperuser(auth.user)
					? 'SELECT id, name, email, role, `group`, is_superuser, created_at FROM users WHERE id = $id LIMIT 1;'
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
		if (!isAdmin(auth.user)) {
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
		if (typeof payload.group === 'string') {
			const nextGroup = payload.group.trim();
			if (!nextGroup) {
				return jsonError(event, 400, 'bad_request', 'group must be a non-empty string.');
			}
			if (!isSuperuser(auth.user)) {
				return jsonError(event, 403, 'forbidden', 'Only superuser can change user groups.');
			}
			patch.group = nextGroup;
		}
		if (typeof payload.role === 'string') {
			const role = payload.role.trim().toLowerCase();
			if (!isUserRole(role)) {
				return jsonError(event, 400, 'bad_request', 'role must be one of admin, editor, viewer.');
			}
			patch.role = role;
		}

		if (!Object.keys(patch).length) {
			return jsonError(event, 400, 'bad_request', 'At least one field is required (name, email, role, group).');
		}

		const userId = new RecordId('users', event.params.id);
		try {
			if (patch.group && normalizeRecordId(auth.user.id) === normalizeRecordId(userId)) {
				return jsonError(event, 400, 'bad_request', 'You cannot change your own group.');
			}

			if (!isSuperuser(auth.user)) {
				const allowed = await withAdminDb((db) =>
					queryOne<{ id?: string }>(
						db,
						'SELECT id FROM users WHERE id = $id AND `group` = $group LIMIT 1;',
						{ id: userId, group: auth.user.group }
					)
				);
				if (!allowed?.id) return jsonError(event, 404, 'not_found', 'User not found.');
			}

			if (patch.group) {
				const target = await withAdminDb((db) =>
					queryOne<{ is_superuser?: boolean }>(
						db,
						'SELECT is_superuser FROM users WHERE id = $id LIMIT 1;',
						{ id: userId }
					)
				);
				if (!target) return jsonError(event, 404, 'not_found', 'User not found.');
				if (target.is_superuser) {
					return jsonError(event, 400, 'bad_request', 'Cannot change superuser group.');
				}
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
