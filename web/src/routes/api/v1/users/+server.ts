import type { RequestHandler } from './$types';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryMany, queryOne, withAdminDb } from '$lib/server/db';
import { withRequiredUser } from '$lib/server/route';
import { isAdmin, isSuperuser } from '$lib/server/policy';
import { parsePaginationParams } from '$lib/server/pagination';
import { sendForgotNotification } from '$lib/server/notifications';
import type { User } from '$lib/types';
import { userRoles } from '$lib/constants';

const isUserRole = (value: string): value is User["role"] =>
	userRoles.includes(value);

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     tags: [Users]
 *     summary: List users
 *     description: Admin only
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: User list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UsersListEnvelope'
 *       403:
 *         $ref: '#/components/responses/Unauthorized'
 *   post:
 *     tags: [Users]
 *     summary: Create user
 *     description: Admin only. A password reset token is sent automatically via email.
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               role:
 *                 type: string
 *                 enum: [admin, editor, viewer]
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserEnvelope'
 *       502:
 *         description: Notification delivery failed
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (!isAdmin(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Only admin users can list users.');
		}

		const pagination = parsePaginationParams(event.url.searchParams);
		if (!pagination.ok) {
			return jsonError(event, 400, 'bad_request', pagination.message);
		}

		if (pagination.value.mode === 'all') {
			const users = await withAdminDb((db) =>
				queryMany(
					db,
					isSuperuser(auth.user)
						? 'SELECT id, name, email, role, `group`, is_superuser, created_at FROM users ORDER BY created_at DESC;'
						: 'SELECT id, name, email, role, `group`, is_superuser, created_at FROM users WHERE `group` = $group ORDER BY created_at DESC;',
					{ group: auth.user.group }
				)
			);
			return jsonOk(event, { users: users ?? [] });
		}

		const { page, pageSize, limit, offset } = pagination.value;
		const users = await withAdminDb((db) =>
			queryMany(
				db,
				isSuperuser(auth.user)
					? 'SELECT id, name, email, role, `group`, is_superuser, created_at FROM users ORDER BY created_at DESC LIMIT $limit START $offset;'
					: 'SELECT id, name, email, role, `group`, is_superuser, created_at FROM users WHERE `group` = $group ORDER BY created_at DESC LIMIT $limit START $offset;',
				{ limit, offset, group: auth.user.group }
			)
		);
		const countRow = await withAdminDb((db) =>
			queryOne<{ total_items: number }>(
				db,
				isSuperuser(auth.user)
					? 'SELECT count() AS total_items FROM users GROUP ALL;'
					: 'SELECT count() AS total_items FROM users WHERE `group` = $group GROUP ALL;',
				{ group: auth.user.group }
			)
		);

		return jsonOk(event, {
			users: users ?? [],
			page,
			page_size: pageSize,
			total_items: Number(countRow?.total_items ?? 0)
		});
	});
};

export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (!isAdmin(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Only admin users can create users.');
		}

		let payload: Record<string, unknown>;
		try {
			payload = await parseJson(event.request);
		} catch (error) {
			return jsonError(event, 400, 'bad_request', (error as Error).message);
		}

		const name = typeof payload.name === 'string' ? payload.name.trim() : '';
		const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
		const roleRaw = typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : '';

		if (!name || !email || !roleRaw) {
			return jsonError(event, 400, 'bad_request', 'name, email and role are required.');
		}
		if (!isUserRole(roleRaw)) {
			return jsonError(event, 400, 'bad_request', 'role must be one of admin, editor, viewer.');
		}

		const forgotToken = crypto.randomUUID();
		const randomPassword = crypto.randomUUID();

		let createdUser: { id: string; name: string; email: string; role: string; created_at?: string } | null = null;
		try {
			createdUser = await withAdminDb((db) =>
				queryOne(
					db,
					`CREATE users CONTENT {
						name: $name,
						email: $email,
						role: $role,
						password: crypto::argon2::generate($password),
						forgot_token: $forgotToken,
						\`group\`: $group,
						is_superuser: false
					} RETURN id, name, email, role, \`group\`, is_superuser, created_at;`,
					{
						name,
						email,
						role: roleRaw,
						password: randomPassword,
						forgotToken,
						group: auth.user.group
					}
				)
			);
		} catch (error) {
			return jsonError(event, 400, 'create_failed', (error as Error).message);
		}

		if (!createdUser) {
			return jsonError(event, 400, 'create_failed', 'Unable to create user.');
		}

		try {
			await sendForgotNotification({
				email: createdUser.email,
				forgotToken
			});
		} catch (error) {
			await withAdminDb((db) => db.query('DELETE $id;', { id: createdUser.id }).collect());
			return jsonError(event, 502, 'notification_failed', (error as Error).message);
		}

		return jsonOk(event, { user: createdUser }, 201);
	});
};
