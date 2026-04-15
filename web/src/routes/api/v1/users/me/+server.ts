import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withUserDb } from '$lib/server/db';
import { clearSessionCookies } from '$lib/server/auth';

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get my user
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserEnvelope'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	return jsonOk(event, { user: auth.user });
};

/**
 * @swagger
 * /api/v1/users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update my user
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               old_password: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserEnvelope'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *   delete:
 *     tags: [Users]
 *     summary: Delete my user
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: User deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteEnvelope'
 *       409:
 *         description: User owns one or more websites
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const PATCH: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const patch: Record<string, unknown> = {};
	if (typeof payload.name === 'string') patch.name = payload.name.trim();
	if (typeof payload.email === 'string') patch.email = payload.email.trim();
	const oldPassword = typeof payload.old_password === 'string' ? payload.old_password : '';
	const newPassword = typeof payload.password === 'string' ? payload.password : '';

	const wantsPasswordChange = !!oldPassword || !!newPassword;
	if (wantsPasswordChange && (!oldPassword || !newPassword)) {
		return jsonError(event, 400, 'bad_request', 'old_password and password must be provided together.');
	}

	if (!Object.keys(patch).length && !wantsPasswordChange) {
		return jsonError(event, 400, 'bad_request', 'At least one updatable field is required (name, email, old_password+password).');
	}

	try {
		const user = await withUserDb(auth.token, async (db) => {
			if (wantsPasswordChange) {
				const verify = await queryOne<{ ok: boolean }>(
					db,
					'SELECT crypto::argon2::compare(password, $oldPassword) AS ok FROM users WHERE id = $auth.id LIMIT 1;',
					{ oldPassword }
				);
				if (!verify?.ok) return null;
			}

			if (Object.keys(patch).length && wantsPasswordChange) {
				return queryOne<{
					id: string;
					email: string;
					name: string;
					role?: string;
					group?: string;
					is_superuser?: boolean;
					created_at?: string;
				}>(
					db,
					'UPDATE $id MERGE $patch SET password = crypto::argon2::generate($newPassword) RETURN id, email, name, role, `group`, is_superuser, created_at;',
					{ id: auth.user.id, patch, newPassword }
				);
			}

			if (wantsPasswordChange) {
				return queryOne<{
					id: string;
					email: string;
					name: string;
					role?: string;
					group?: string;
					is_superuser?: boolean;
					created_at?: string;
				}>(
					db,
					'UPDATE $id SET password = crypto::argon2::generate($newPassword) RETURN id, email, name, role, `group`, is_superuser, created_at;',
					{ id: auth.user.id, newPassword }
				);
			}

			return queryOne<{
				id: string;
				email: string;
				name: string;
				role?: string;
				group?: string;
				is_superuser?: boolean;
				created_at?: string;
			}>(
				db,
				'UPDATE $id MERGE $patch RETURN id, email, name, role, `group`, is_superuser, created_at;',
				{ id: auth.user.id, patch }
			);
		});

		if (wantsPasswordChange && !user) {
			return jsonError(event, 401, 'auth_failed', 'old_password is invalid.');
		}
		if (!user) return jsonError(event, 404, 'not_found', 'User not found.');

		return jsonOk(event, { user });
	} catch (error) {
		return jsonError(event, 400, 'update_failed', (error as Error).message);
	}
};

export const DELETE: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;
	if (auth.user.is_superuser) {
		return jsonError(event, 403, 'forbidden', 'Superuser account cannot be deleted.');
	}

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const password = typeof payload.password === 'string' ? payload.password : '';
	if (!password) {
		return jsonError(event, 400, 'bad_request', 'password is required.');
	}

	try {
		const state = await withUserDb(auth.token, async (db) => {
			const verify = await queryOne<{ ok: boolean }>(
				db,
				'SELECT crypto::argon2::compare(password, $password) AS ok FROM users WHERE id = $auth.id LIMIT 1;',
				{ password }
			);
			if (!verify?.ok) return { invalidPassword: true as const };

			const existing = await queryOne<{ id?: string }>(
				db,
				'SELECT id FROM users WHERE id = $auth.id LIMIT 1;'
			);
			if (!existing?.id) return { notFound: true as const };

			const ownedWebsites = await queryOne<{ total_items: number }>(
				db,
				'SELECT count() AS total_items FROM websites WHERE owner = $auth.id GROUP ALL;'
			);
			if (Number(ownedWebsites?.total_items ?? 0) > 0) return { ownsWebsites: true as const };

			await db.query('DELETE $auth.id;').collect();
			try {
				await db.invalidate();
			} catch {
				// Best-effort; account is already deleted.
			}
			return { deleted: true as const };
		});

		if ('invalidPassword' in state) {
			return jsonError(event, 401, 'auth_failed', 'password is invalid.');
		}

		if ('notFound' in state) {
			return jsonError(event, 404, 'not_found', 'User not found.');
		}

		if ('ownsWebsites' in state) {
			return jsonError(
				event,
				409,
				'cannot_delete_owner',
				'Cannot delete your account because you own one or more websites.'
			);
		}

		clearSessionCookies(event);
		return jsonOk(event, { deleted: true });
	} catch (error) {
		return jsonError(event, 400, 'delete_failed', (error as Error).message);
	}
};
