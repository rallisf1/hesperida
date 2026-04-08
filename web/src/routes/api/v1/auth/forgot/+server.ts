import type { RequestHandler } from './$types';
import { queryOne, withAdminDb } from '$lib/server/db';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';

/**
 * @swagger
 * /api/v1/auth/forgot:
 *   post:
 *     tags: [Auth]
 *     summary: Start password reset flow for a user email
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
 *         description: Reset token generated
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Auth]
 *     summary: Complete password reset using forgot token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [forgot_token, password]
 *             properties:
 *               forgot_token: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Password updated
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const POST: RequestHandler = async (event) => {
	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const email = typeof payload.email === 'string' ? payload.email.trim() : '';
	if (!email) return jsonError(event, 400, 'bad_request', 'email is required.');

	const user = await withAdminDb((db) =>
		queryOne<{ id: string }>(db, 'SELECT id FROM users WHERE email = $email LIMIT 1;', { email })
	);
	if (!user) return jsonError(event, 404, 'not_found', 'User not found.');

	const forgotToken = crypto.randomUUID();
	await withAdminDb((db) =>
		queryOne(db, 'UPDATE $id SET forgot_token = $forgotToken RETURN AFTER;', {
			id: user.id,
			forgotToken
		})
	);

	// TODO: Send forgot password notification (email/SMS/webhook) with reset token link.
	return jsonOk(event, { success: true });
};

export const PATCH: RequestHandler = async (event) => {
	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const forgotToken = typeof payload.forgot_token === 'string' ? payload.forgot_token.trim() : '';
	const password = typeof payload.password === 'string' ? payload.password : '';
	if (!forgotToken || !password) {
		return jsonError(event, 400, 'bad_request', 'forgot_token and password are required.');
	}

	const user = await withAdminDb((db) =>
		queryOne<{ id: string }>(db, 'SELECT id FROM users WHERE forgot_token = $forgotToken LIMIT 1;', {
			forgotToken
		})
	);
	if (!user) return jsonError(event, 404, 'not_found', 'Invalid forgot token.');

	await withAdminDb((db) =>
		queryOne(
			db,
			'UPDATE $id SET password = crypto::argon2::generate($password), forgot_token = NONE RETURN AFTER;',
			{ id: user.id, password }
		)
	);

	return jsonOk(event, { success: true });
};

