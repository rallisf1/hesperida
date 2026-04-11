import type { RequestHandler } from './$types';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withAdminDb } from '$lib/server/db';
import { withRequiredUser } from '$lib/server/route';
import { isAdmin } from '$lib/server/policy';
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
				'SELECT id, name, email, role, created_at FROM users WHERE id = $id LIMIT 1;',
				{ id: userId }
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
		if (typeof payload.role === 'string') {
			const role = payload.role.trim().toLowerCase();
			if (!isUserRole(role)) {
				return jsonError(event, 400, 'bad_request', 'role must be one of admin, editor, viewer.');
			}
			patch.role = role;
		}

		if (!Object.keys(patch).length) {
			return jsonError(event, 400, 'bad_request', 'At least one field is required (name, email, role).');
		}

		const userId = new RecordId('users', event.params.id);
		try {
			const updated = await withAdminDb((db) =>
				queryOne(
					db,
					'UPDATE $id MERGE $patch RETURN id, name, email, role, created_at;',
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
			queryOne<{ id: string }>(
				db,
				'SELECT id FROM users WHERE id = $id LIMIT 1;',
				{ id: userId }
			)
		);
		if (!existing) return jsonError(event, 404, 'not_found', 'User not found.');

		await withAdminDb((db) => db.query('DELETE $id;', { id: userId }).collect());
		return jsonOk(event, { deleted: true });
	});
};

