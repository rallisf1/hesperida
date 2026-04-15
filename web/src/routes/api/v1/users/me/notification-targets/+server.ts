import type { RequestHandler } from './$types';
import { DateTime } from 'surrealdb';
import { withRequiredUser, parseJsonOrBadRequest } from '$lib/server/route';
import { jsonError, jsonOk } from '$lib/server/http';
import { withUserDb } from '$lib/server/db';
import { sendTestNotificationToTarget } from '$lib/server/notifications';
import { getUserNotificationTargets, saveUserNotificationTargets } from '$lib/server/notifications/store';
import { validateNotificationTarget } from '$lib/server/notifications/targets';

/**
 * @swagger
 * /api/v1/users/me/notification-targets:
 *   get:
 *     tags: [Users]
 *     summary: List notification targets
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification targets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationTargetsEnvelope'
 *   post:
 *     tags: [Users]
 *     summary: Create notification
 *     description: Requires a successful send test.
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [target]
 *             properties:
 *               target: { type: string }
 *               label: { type: string }
 *               enabled: { type: boolean }
 *     responses:
 *       201:
 *         description: Notification target created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationTargetAndTargetsEnvelope'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       502:
 *         description: Target test failed
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const targets = await withUserDb(auth.token, (db) => getUserNotificationTargets(db));
		return jsonOk(event, { targets });
	});
};

export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const parsed = await parseJsonOrBadRequest(event);
		if (!parsed.ok) return parsed.response;

		const target = validateNotificationTarget(parsed.data.target);
		if (!target) {
			return jsonError(event, 400, 'bad_request', 'target must be a valid Apprise URL.');
		}

		const label =
			typeof parsed.data.label === 'string' && parsed.data.label.trim()
				? parsed.data.label.trim()
				: undefined;
		const enabled = typeof parsed.data.enabled === 'boolean' ? parsed.data.enabled : true;

		try {
			await sendTestNotificationToTarget(target);
		} catch (error) {
			return jsonError(event, 502, 'notification_test_failed', (error as Error).message);
		}

		const now = new DateTime();
		const created = {
			id: crypto.randomUUID(),
			target,
			enabled,
			...(label ? { label } : {}),
			created_at: now,
			updated_at: now
		};

		const targets = await withUserDb(auth.token, async (db) => {
			const current = await getUserNotificationTargets(db);
			current.push(created);
			return saveUserNotificationTargets(db, current);
		});

		return jsonOk(event, { target: created, targets }, 201);
	});
};
