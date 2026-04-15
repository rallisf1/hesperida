import type { RequestHandler } from './$types';
import { config } from '$lib/server/config';
import { withAnonDb } from '$lib/server/db';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { getCurrentUser, setSessionCookies } from '$lib/server/auth';

/**
 * @swagger
 * /api/v1/auth/signin:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSessionEnvelope'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         description: Invalid credentials
 */
export const POST: RequestHandler = async (event) => {
	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const email = typeof payload.email === 'string' ? payload.email.trim() : '';
	const password = typeof payload.password === 'string' ? payload.password : '';

	if (!email || !password) {
		return jsonError(event, 400, 'bad_request', 'email and password are required.');
	}

	try {
		const tokens = await withAnonDb((db) =>
			db.signin({
				namespace: config.surrealNamespace,
				database: config.surrealDatabase,
				access: 'users',
				variables: { email, password }
			})
		);

		setSessionCookies(event, {
			access: tokens.access,
			refresh: tokens.refresh ?? null
		});

		const user = await getCurrentUser(tokens.access);
		return jsonOk(event, { user, token: tokens.access, refresh_token: tokens.refresh ?? null });
	} catch (error) {
		return jsonError(event, 401, 'auth_failed', (error as Error).message);
	}
};
