import type { RequestHandler } from './$types';
import { withRequiredUser, parseJsonOrBadRequest } from '$lib/server/route';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryMany, queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { validateNotificationTarget } from '$lib/server/notifications/targets';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import type { NotificationChannel } from '$lib/types';

/**
 * @swagger
 * /api/v1/notification-channels:
 *   get:
 *     tags: [Notifications]
 *     summary: List notification channels
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: user
 *         required: false
 *         schema: { type: string }
 *         description: Superuser only.
 *     responses:
 *       200:
 *         description: Notification channels
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationChannelsEnvelope'
 *   post:
 *     tags: [Notifications]
 *     summary: Create notification channel
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, apprise_url]
 *             properties:
 *               name: { type: string }
 *               apprise_url: { type: string }
 *               user:
 *                 type: string
 *                 description: Superuser only.
 *     responses:
 *       201:
 *         description: Channel created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationChannelEnvelope'
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const requestedUser = event.url.searchParams.get('user')?.trim() ?? '';
		if (requestedUser && !isSuperuser(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Only superusers can filter channels by user.');
		}

		if (isSuperuser(auth.user)) {
			const channels = await withAdminDb((db) =>
				queryMany<
					NotificationChannel & { user_name?: string; user_email?: string }
				>(
					db,
					requestedUser
						? `SELECT id, user, name, apprise_url, created_at, updated_at, user.name AS user_name, user.email AS user_email
						   FROM notification_channels
						   WHERE user = $user
						   ORDER BY created_at DESC;`
						: `SELECT id, user, name, apprise_url, created_at, updated_at, user.name AS user_name, user.email AS user_email
						   FROM notification_channels
						   ORDER BY created_at DESC;`,
					requestedUser
						? { user: new RecordId('users', toRouteId(requestedUser)) }
						: undefined
				)
			);
			return jsonOk(event, { channels });
		}

		const channels = await withUserDb(auth.token, (db) =>
			queryMany<NotificationChannel>(
				db,
				`SELECT id, user, name, apprise_url, created_at, updated_at
				 FROM notification_channels
				 WHERE user = $auth.id
				 ORDER BY created_at DESC;`
			)
		);
		return jsonOk(event, { channels });
	});
};

export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const parsed = await parseJsonOrBadRequest(event);
		if (!parsed.ok) return parsed.response;

		const name = String(parsed.data.name ?? '').trim();
		if (!name.length) {
			return jsonError(event, 400, 'bad_request', 'name is required.');
		}

		const targetUrl = validateNotificationTarget(parsed.data.apprise_url);
		if (!targetUrl) {
			return jsonError(event, 400, 'bad_request', 'apprise_url must be a valid Apprise URL.');
		}

		let targetUserId = auth.user.id;
		if (typeof parsed.data.user === 'string' && parsed.data.user.trim().length > 0) {
			if (!isSuperuser(auth.user)) {
				return jsonError(
					event,
					403,
					'forbidden',
					'Only superusers can create channels for other users.'
				);
			}
			targetUserId = new RecordId('users', toRouteId(parsed.data.user));
		}

		try {
			const channel = await withAdminDb((db) =>
				queryOne<NotificationChannel>(
					db,
					`CREATE notification_channels CONTENT {
						user: $user,
						name: $name,
						apprise_url: $apprise_url
					} RETURN AFTER;`,
					{
						user: targetUserId,
						name,
						apprise_url: targetUrl
					}
				)
			);
			if (!channel) {
				return jsonError(event, 400, 'create_failed', 'Unable to create notification channel.');
			}
			return jsonOk(event, { channel }, 201);
		} catch (error) {
			return jsonError(event, 400, 'create_failed', (error as Error).message);
		}
	});
};
