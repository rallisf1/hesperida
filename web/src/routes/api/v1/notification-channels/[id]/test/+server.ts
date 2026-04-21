import type { RequestHandler } from './$types';
import { withRequiredUser } from '$lib/server/route';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import type { NotificationChannel } from '$lib/types';
import { sendTestNotificationToTarget } from '$lib/server/notifications';

/**
 * @swagger
 * /api/v1/notification-channels/{id}/test:
 *   post:
 *     tags: [Notifications]
 *     summary: Send channel test notification
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
 *         description: Test sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *       502:
 *         description: Notification test failed
 */
export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const channelId = new RecordId('notification_channels', toRouteId(event.params.id));
		const channel = isSuperuser(auth.user)
			? await withAdminDb((db) =>
					queryOne<NotificationChannel>(
						db,
						'SELECT id, user, name, apprise_url, created_at, updated_at FROM notification_channels WHERE id = $id LIMIT 1;',
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

		try {
			await sendTestNotificationToTarget(channel.apprise_url);
		} catch (error) {
			return jsonError(event, 502, 'notification_test_failed', (error as Error).message);
		}

		return jsonOk(event, { tested: true, channel });
	});
};
