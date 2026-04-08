import type { RequestHandler } from './$types';
import { config } from '$lib/server/config';
import { queryOne, withAdminDb, withAnonDb } from '$lib/server/db';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { getCurrentUser } from '$lib/server/auth';

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       201:
 *         description: Account created
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         description: Signup failed
 */
export const POST: RequestHandler = async (event) => {
	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const name = typeof payload.name === 'string' ? payload.name.trim() : '';
	const email = typeof payload.email === 'string' ? payload.email.trim() : '';
	const password = typeof payload.password === 'string' ? payload.password : '';

	if (!name || !email || !password) {
		return jsonError(event, 400, 'bad_request', 'name, email and password are required.');
	}

	try {
		const existingUser = await withAdminDb((db) => queryOne<{ id: string }>(db, 'SELECT id FROM users LIMIT 1;'));
		const role = existingUser ? 'editor' : 'admin';

		await withAdminDb((db) =>
			queryOne(
				db,
				`CREATE users CONTENT {
					name: $name,
					email: $email,
					password: crypto::argon2::generate($password),
					role: $role
				} RETURN AFTER;`,
				{ name, email, password, role }
			)
		);

		const tokens = await withAnonDb((db) =>
			db.signin({
				namespace: config.surrealNamespace,
				database: config.surrealDatabase,
				access: 'users',
				variables: { email, password }
			})
		);

		event.cookies.set(config.sessionCookieName, tokens.access, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: config.sessionCookieSecure,
			maxAge: config.sessionCookieMaxAge
		});

		const user = await getCurrentUser(tokens.access);
		return jsonOk(event, { user, token: tokens.access }, 201);
	} catch (error) {
		return jsonError(event, 401, 'auth_failed', (error as Error).message);
	}
};
