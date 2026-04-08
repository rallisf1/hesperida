import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withUserDb } from '$lib/server/db';

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
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
 *     summary: Update current user profile
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
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
				return queryOne<{ id: string; email: string; name: string; role?: string; created_at?: string }>(
					db,
					'UPDATE $id MERGE $patch SET password = crypto::argon2::generate($newPassword) RETURN id, email, name, role, created_at;',
					{ id: auth.user.id, patch, newPassword }
				);
			}

			if (wantsPasswordChange) {
				return queryOne<{ id: string; email: string; name: string; role?: string; created_at?: string }>(
					db,
					'UPDATE $id SET password = crypto::argon2::generate($newPassword) RETURN id, email, name, role, created_at;',
					{ id: auth.user.id, newPassword }
				);
			}

			return queryOne<{ id: string; email: string; name: string; role?: string; created_at?: string }>(
				db,
				'UPDATE $id MERGE $patch RETURN id, email, name, role, created_at;',
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
