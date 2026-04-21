import type { RequestHandler } from './$types';
import { withRequiredUser, parseJsonOrBadRequest } from '$lib/server/route';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { validateNotificationTarget } from '$lib/server/notifications/targets';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import type { NotificationChannel } from '$lib/types';

/**
 * @swagger
 * /api/v1/notification-channels/{id}:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notification channel
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
 *         description: Channel details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationChannelEnvelope'
 *   patch:
 *     tags: [Notifications]
 *     summary: Update notification channel
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
 *               apprise_url: { type: string }
 *               user:
 *                 type: string
 *                 description: Superuser only.
 *     responses:
 *       200:
 *         description: Channel updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationChannelEnvelope'
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete notification channel
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
 *         description: Channel deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteEnvelope'
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const channelId = new RecordId('notification_channels', toRouteId(event.params.id));
		const channel = isSuperuser(auth.user)
			? await withAdminDb((db) =>
					queryOne<NotificationChannel>(
						db,
						'SELECT id, user, name, apprise_url, created_at, updated_at, user.name AS user_name, user.email AS user_email FROM notification_channels WHERE id = $id LIMIT 1;',
						{ id: channelId }
					)
				)
			: await withUserDb(auth.token, (db) =>
					queryOne<NotificationChannel>(
						db,
						'SELECT id, user, name, apprise_url, created_at, updated_at FROM notification_channels WHERE id = $id LIMIT 1;',
						{ id: channelId }
					)
				);

		if (!channel) {
			return jsonError(event, 404, 'not_found', 'Notification channel not found.');
		}
		return jsonOk(event, { channel });
	});
};

export const PATCH: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const parsed = await parseJsonOrBadRequest(event);
		if (!parsed.ok) return parsed.response;

		const channelId = new RecordId('notification_channels', toRouteId(event.params.id));
		const patch: Record<string, unknown> = {};

		if (typeof parsed.data.name !== 'undefined') {
			const name = String(parsed.data.name ?? '').trim();
			if (!name.length) {
				return jsonError(event, 400, 'bad_request', 'name cannot be empty.');
			}
			patch.name = name;
		}

		if (typeof parsed.data.apprise_url !== 'undefined') {
			const targetUrl = validateNotificationTarget(parsed.data.apprise_url);
			if (!targetUrl) {
				return jsonError(event, 400, 'bad_request', 'apprise_url must be a valid Apprise URL.');
			}
			patch.apprise_url = targetUrl;
		}

		if (typeof parsed.data.user !== 'undefined') {
			if (!isSuperuser(auth.user)) {
				return jsonError(
					event,
					403,
					'forbidden',
					'Only superusers can update channel owners.'
				);
			}
			const userRaw = String(parsed.data.user ?? '').trim();
			if (!userRaw.length) {
				return jsonError(event, 400, 'bad_request', 'user cannot be empty.');
			}
			patch.user = new RecordId('users', toRouteId(userRaw));
		}

		if (!Object.keys(patch).length) {
			return jsonError(
				event,
				400,
				'bad_request',
				'At least one field is required (name, apprise_url, user).'
			);
		}

		try {
			const updated = isSuperuser(auth.user)
				? await withAdminDb(async (db) => {
						const existing = await db.select<NotificationChannel>(channelId);
						if (!existing?.id) return null;
						return queryOne<NotificationChannel>(db, 'UPDATE $id MERGE $patch RETURN AFTER;', {
							id: channelId,
							patch
						});
					})
				: await withUserDb(auth.token, async (db) => {
						const existing = await db.select<NotificationChannel>(channelId);
						if (!existing?.id) return null;
						return queryOne<NotificationChannel>(db, 'UPDATE $id MERGE $patch RETURN AFTER;', {
							id: channelId,
							patch
						});
					});

			if (!updated) {
				return jsonError(event, 404, 'not_found', 'Notification channel not found.');
			}

			return jsonOk(event, { channel: updated });
		} catch (error) {
			return jsonError(event, 400, 'update_failed', (error as Error).message);
		}
	});
};

export const DELETE: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const channelId = new RecordId('notification_channels', toRouteId(event.params.id));
		try {
			const deleted = isSuperuser(auth.user)
				? await withAdminDb(async (db) => {
						const existing = await db.select<NotificationChannel>(channelId);
						if (!existing?.id) return false;
						await db.delete(channelId);
						return true;
					})
				: await withUserDb(auth.token, async (db) => {
						const existing = await db.select<NotificationChannel>(channelId);
						if (!existing?.id) return false;
						await db.delete(channelId);
						return true;
					});

			if (!deleted) {
				return jsonError(event, 404, 'not_found', 'Notification channel not found.');
			}
			return jsonOk(event, { deleted: true });
		} catch (error) {
			return jsonError(event, 400, 'delete_failed', (error as Error).message);
		}
	});
};
