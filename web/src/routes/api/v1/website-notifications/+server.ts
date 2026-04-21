import type { RequestHandler } from './$types';
import { withRequiredUser, parseJsonOrBadRequest } from '$lib/server/route';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryMany, queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId, Table } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import type { NotificationChannel, Website, WebsiteNotification } from '$lib/types';
import {
	defaultWebsiteNotificationEvents,
	hasEnabledWebsiteNotificationEvent,
	parseWebsiteNotificationEvents
} from '$lib/server/website-notification-events';

const parseRecordParam = (
	value: string | null,
	table: 'websites' | 'notification_channels'
): RecordId | null => {
	const raw = value?.trim() ?? '';
	if (!raw.length) return null;
	return new RecordId(table, toRouteId(raw));
};

/**
 * @swagger
 * /api/v1/website-notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List website notification links
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: website
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: channel
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Website notification links
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteNotificationsEnvelope'
 *   post:
 *     tags: [Notifications]
 *     summary: Create website notification link
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [website, notification_channel]
 *             properties:
 *               website: { type: string }
 *               notification_channel: { type: string }
 *               events:
 *                 $ref: '#/components/schemas/WebsiteNotificationEvents'
 *     responses:
 *       201:
 *         description: Link created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteNotificationEnvelope'
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const website = parseRecordParam(event.url.searchParams.get('website'), 'websites');
		const channel = parseRecordParam(event.url.searchParams.get('channel'), 'notification_channels');
		const where: string[] = [];
		const vars: Record<string, unknown> = {};
		if (website) {
			where.push('website = $website');
			vars.website = website;
		}
		if (channel) {
			where.push('notification_channel = $channel');
			vars.channel = channel;
		}
		const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

		const sql = `SELECT id, website, notification_channel, events, created_at, updated_at,
			website.url AS website_url,
			notification_channel.name AS channel_name,
			notification_channel.apprise_url AS channel_apprise_url,
			notification_channel.user AS channel_user
			FROM website_notifications ${whereClause} ORDER BY created_at DESC;`;

		const links = isSuperuser(auth.user)
			? await withAdminDb((db) => queryMany<WebsiteNotification & Record<string, unknown>>(db, sql, vars))
			: await withUserDb(auth.token, (db) =>
					queryMany<WebsiteNotification & Record<string, unknown>>(db, sql, vars)
				);

		return jsonOk(event, { links });
	});
};

export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const parsed = await parseJsonOrBadRequest(event);
		if (!parsed.ok) return parsed.response;

		const websiteRaw = typeof parsed.data.website === 'string' ? parsed.data.website.trim() : '';
		const channelRaw =
			typeof parsed.data.notification_channel === 'string'
				? parsed.data.notification_channel.trim()
				: '';
		if (!websiteRaw || !channelRaw) {
			return jsonError(event, 400, 'bad_request', 'website and notification_channel are required.');
		}

		const websiteId = new RecordId('websites', toRouteId(websiteRaw));
		const channelId = new RecordId('notification_channels', toRouteId(channelRaw));
		const events = parseWebsiteNotificationEvents(
			parsed.data.events ?? defaultWebsiteNotificationEvents(),
			defaultWebsiteNotificationEvents()
		);
		if (!events) {
			return jsonError(
				event,
				400,
				'bad_request',
				'events must be a valid object with booleans and score thresholds between 0 and 100.'
			);
		}
		if (!hasEnabledWebsiteNotificationEvent(events)) {
			return jsonError(event, 400, 'bad_request', 'At least one event must be enabled.');
		}

		try {
			const created = isSuperuser(auth.user)
				? await withAdminDb(async (db) => {
						const website = await db.select<Website>(websiteId);
						if (!website?.id) return 'missing_website' as const;
						const channel = await db.select<NotificationChannel>(channelId);
						if (!channel?.id) return 'missing_channel' as const;
						const createdRows = await db
							.create<WebsiteNotification>(new Table('website_notifications'))
							.content({
								website: websiteId,
								notification_channel: channelId,
								events
							});
						const row = Array.isArray(createdRows) ? createdRows[0] : createdRows;
						if (!row?.id) return null;
						return queryOne<WebsiteNotification & Record<string, unknown>>(
							db,
							`SELECT id, website, notification_channel, events, created_at, updated_at,
								website.url AS website_url,
								notification_channel.name AS channel_name,
								notification_channel.apprise_url AS channel_apprise_url,
								notification_channel.user AS channel_user
							 FROM website_notifications WHERE id = $id LIMIT 1;`,
							{ id: row.id }
						);
					})
				: await withUserDb(auth.token, async (db) => {
						const website = await db.select<Website>(websiteId);
						if (!website?.id) return 'missing_website' as const;
						const channel = await queryOne<NotificationChannel>(
							db,
							'SELECT id, user, name, apprise_url FROM notification_channels WHERE id = $id AND user = $auth.id LIMIT 1;',
							{ id: channelId }
						);
						if (!channel) return 'channel_forbidden' as const;
						const createdRows = await db
							.create<WebsiteNotification>(new Table('website_notifications'))
							.content({
								website: websiteId,
								notification_channel: channelId,
								events
							});
						const row = Array.isArray(createdRows) ? createdRows[0] : createdRows;
						if (!row?.id) return null;
						return queryOne<WebsiteNotification & Record<string, unknown>>(
							db,
							`SELECT id, website, notification_channel, events, created_at, updated_at,
								website.url AS website_url,
								notification_channel.name AS channel_name,
								notification_channel.apprise_url AS channel_apprise_url,
								notification_channel.user AS channel_user
							 FROM website_notifications WHERE id = $id LIMIT 1;`,
							{ id: row.id }
						);
					});

			if (created === 'missing_website') {
				return jsonError(event, 404, 'not_found', 'Website not found.');
			}
			if (created === 'missing_channel') {
				return jsonError(event, 404, 'not_found', 'Notification channel not found.');
			}
			if (created === 'channel_forbidden') {
				return jsonError(
					event,
					403,
					'forbidden',
					'You can only link channels owned by your user.'
				);
			}
			if (!created) {
				return jsonError(event, 400, 'create_failed', 'Unable to create website notification link.');
			}

			return jsonOk(event, { link: created }, 201);
		} catch (error) {
			return jsonError(event, 400, 'create_failed', (error as Error).message);
		}
	});
};
