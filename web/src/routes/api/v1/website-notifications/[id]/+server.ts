import type { RequestHandler } from './$types';
import { withRequiredUser, parseJsonOrBadRequest } from '$lib/server/route';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import type { NotificationChannel, Website, WebsiteNotification } from '$lib/types';
import {
	hasEnabledWebsiteNotificationEvent,
	parseWebsiteNotificationEvents
} from '$lib/server/website-notification-events';

/**
 * @swagger
 * /api/v1/website-notifications/{id}:
 *   get:
 *     tags: [Notifications]
 *     summary: Get website notification link
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
 *         description: Link details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteNotificationEnvelope'
 *   patch:
 *     tags: [Notifications]
 *     summary: Update website notification link
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
 *               website: { type: string }
 *               notification_channel: { type: string }
 *               events:
 *                 $ref: '#/components/schemas/WebsiteNotificationEvents'
 *     responses:
 *       200:
 *         description: Link updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteNotificationEnvelope'
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete website notification link
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
 *         description: Link deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteEnvelope'
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const linkId = new RecordId('website_notifications', toRouteId(event.params.id));
		const link = isSuperuser(auth.user)
			? await withAdminDb((db) =>
					queryOne<WebsiteNotification & Record<string, unknown>>(
						db,
						`SELECT id, website, notification_channel, events, created_at, updated_at,
							website.url AS website_url,
							notification_channel.name AS channel_name,
							notification_channel.apprise_url AS channel_apprise_url,
							notification_channel.user AS channel_user
						 FROM website_notifications WHERE id = $id LIMIT 1;`,
						{ id: linkId }
					)
				)
			: await withUserDb(auth.token, (db) =>
					queryOne<WebsiteNotification & Record<string, unknown>>(
						db,
						`SELECT id, website, notification_channel, events, created_at, updated_at,
							website.url AS website_url,
							notification_channel.name AS channel_name,
							notification_channel.apprise_url AS channel_apprise_url,
							notification_channel.user AS channel_user
						 FROM website_notifications WHERE id = $id LIMIT 1;`,
						{ id: linkId }
					)
				);

		if (!link) {
			return jsonError(event, 404, 'not_found', 'Website notification link not found.');
		}
		return jsonOk(event, { link });
	});
};

export const PATCH: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const parsed = await parseJsonOrBadRequest(event);
		if (!parsed.ok) return parsed.response;

		const linkId = new RecordId('website_notifications', toRouteId(event.params.id));
		try {
			const result = isSuperuser(auth.user)
				? await withAdminDb(async (db) => {
						const existing = await queryOne<WebsiteNotification>(
							db,
							'SELECT id, website, notification_channel, events FROM website_notifications WHERE id = $id LIMIT 1;',
							{ id: linkId }
						);
						if (!existing) return 'missing' as const;

						const patch: Record<string, unknown> = {};
						if (typeof parsed.data.website === 'string' && parsed.data.website.trim().length > 0) {
							const websiteId = new RecordId('websites', toRouteId(parsed.data.website));
							const website = await db.select<Website>(websiteId);
							if (!website?.id) return 'missing_website' as const;
							patch.website = websiteId;
						}
						if (
							typeof parsed.data.notification_channel === 'string' &&
							parsed.data.notification_channel.trim().length > 0
						) {
							const channelId = new RecordId(
								'notification_channels',
								toRouteId(parsed.data.notification_channel)
							);
							const channel = await db.select<NotificationChannel>(channelId);
							if (!channel?.id) return 'missing_channel' as const;
							patch.notification_channel = channelId;
						}
						if (typeof parsed.data.events !== 'undefined') {
							const next = parseWebsiteNotificationEvents(parsed.data.events, existing.events);
							if (!next) return 'invalid_events' as const;
							if (!hasEnabledWebsiteNotificationEvent(next)) return 'no_events' as const;
							patch.events = next;
						}

						if (!Object.keys(patch).length) return 'empty_patch' as const;
						await db.update(linkId).merge(patch);
						return queryOne<WebsiteNotification & Record<string, unknown>>(
							db,
							`SELECT id, website, notification_channel, events, created_at, updated_at,
								website.url AS website_url,
								notification_channel.name AS channel_name,
								notification_channel.apprise_url AS channel_apprise_url,
								notification_channel.user AS channel_user
							 FROM website_notifications WHERE id = $id LIMIT 1;`,
							{ id: linkId }
						);
					})
				: await withUserDb(auth.token, async (db) => {
						const existing = await queryOne<WebsiteNotification>(
							db,
							'SELECT id, website, notification_channel, events FROM website_notifications WHERE id = $id LIMIT 1;',
							{ id: linkId }
						);
						if (!existing) return 'missing' as const;

						const patch: Record<string, unknown> = {};
						if (typeof parsed.data.website === 'string' && parsed.data.website.trim().length > 0) {
							const websiteId = new RecordId('websites', toRouteId(parsed.data.website));
							const website = await db.select<Website>(websiteId);
							if (!website?.id) return 'missing_website' as const;
							patch.website = websiteId;
						}
						if (
							typeof parsed.data.notification_channel === 'string' &&
							parsed.data.notification_channel.trim().length > 0
						) {
							const channelId = new RecordId(
								'notification_channels',
								toRouteId(parsed.data.notification_channel)
							);
							const channel = await queryOne<NotificationChannel>(
								db,
								'SELECT id, user, name, apprise_url FROM notification_channels WHERE id = $id AND user = $auth.id LIMIT 1;',
								{ id: channelId }
							);
							if (!channel) return 'channel_forbidden' as const;
							patch.notification_channel = channelId;
						}
						if (typeof parsed.data.events !== 'undefined') {
							const next = parseWebsiteNotificationEvents(parsed.data.events, existing.events);
							if (!next) return 'invalid_events' as const;
							if (!hasEnabledWebsiteNotificationEvent(next)) return 'no_events' as const;
							patch.events = next;
						}

						if (!Object.keys(patch).length) return 'empty_patch' as const;
						await db.update(linkId).merge(patch);
						return queryOne<WebsiteNotification & Record<string, unknown>>(
							db,
							`SELECT id, website, notification_channel, events, created_at, updated_at,
								website.url AS website_url,
								notification_channel.name AS channel_name,
								notification_channel.apprise_url AS channel_apprise_url,
								notification_channel.user AS channel_user
							 FROM website_notifications WHERE id = $id LIMIT 1;`,
							{ id: linkId }
						);
					});

			if (result === 'missing') {
				return jsonError(event, 404, 'not_found', 'Website notification link not found.');
			}
			if (result === 'missing_website') {
				return jsonError(event, 404, 'not_found', 'Website not found.');
			}
			if (result === 'missing_channel') {
				return jsonError(event, 404, 'not_found', 'Notification channel not found.');
			}
			if (result === 'channel_forbidden') {
				return jsonError(
					event,
					403,
					'forbidden',
					'You can only link channels owned by your user.'
				);
			}
			if (result === 'invalid_events') {
				return jsonError(
					event,
					400,
					'bad_request',
					'events must be a valid object with booleans and score thresholds between 0 and 100.'
				);
			}
			if (result === 'no_events') {
				return jsonError(event, 400, 'bad_request', 'At least one event must be enabled.');
			}
			if (result === 'empty_patch') {
				return jsonError(
					event,
					400,
					'bad_request',
					'At least one field is required (website, notification_channel, events).'
				);
			}
			if (!result) {
				return jsonError(event, 400, 'update_failed', 'Unable to update website notification link.');
			}

			return jsonOk(event, { link: result });
		} catch (error) {
			return jsonError(event, 400, 'update_failed', (error as Error).message);
		}
	});
};

export const DELETE: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const linkId = new RecordId('website_notifications', toRouteId(event.params.id));
		try {
			const deleted = isSuperuser(auth.user)
				? await withAdminDb(async (db) => {
						const existing = await queryOne<WebsiteNotification>(
							db,
							'SELECT id FROM website_notifications WHERE id = $id LIMIT 1;',
							{ id: linkId }
						);
						if (!existing) return false;
						await db.delete(linkId);
						return true;
					})
				: await withUserDb(auth.token, async (db) => {
						const existing = await queryOne<WebsiteNotification>(
							db,
							'SELECT id FROM website_notifications WHERE id = $id LIMIT 1;',
							{ id: linkId }
						);
						if (!existing) return false;
						await db.delete(linkId);
						return true;
					});

			if (!deleted) {
				return jsonError(event, 404, 'not_found', 'Website notification link not found.');
			}
			return jsonOk(event, { deleted: true });
		} catch (error) {
			return jsonError(event, 400, 'delete_failed', (error as Error).message);
		}
	});
};
