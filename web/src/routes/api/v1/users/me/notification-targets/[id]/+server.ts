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
 * /api/v1/users/me/notification-targets/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update a notification target (test send required)
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
 *         description: Notification target updated
 *   delete:
 *     tags: [Users]
 *     summary: Delete a notification target
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
 *         description: Notification target deleted
 */
export const PATCH: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const parsed = await parseJsonOrBadRequest(event);
		if (!parsed.ok) return parsed.response;

		const targetId = decodeURIComponent(event.params.id).trim();
		if (!targetId) return jsonError(event, 400, 'bad_request', 'id is required.');

		const targetInputRaw =
			typeof parsed.data.target !== 'undefined'
				? validateNotificationTarget(parsed.data.target)
				: undefined;
		if (typeof parsed.data.target !== 'undefined' && !targetInputRaw) {
			return jsonError(event, 400, 'bad_request', 'target must be a valid Apprise URL.');
		}
		const targetInput = targetInputRaw ?? undefined;

		const label =
			typeof parsed.data.label === 'string' ? parsed.data.label.trim() : undefined;
		const enabled = typeof parsed.data.enabled === 'boolean' ? parsed.data.enabled : undefined;

		if (typeof targetInput === 'undefined' && typeof label === 'undefined' && typeof enabled === 'undefined') {
			return jsonError(event, 400, 'bad_request', 'At least one field is required (target, label, enabled).');
		}

		const state = await withUserDb(auth.token, async (db) => {
			const current = await getUserNotificationTargets(db);
			const index = current.findIndex((item) => item.id === targetId);
			if (index < 0) return { missing: true as const };

			const previous = current[index];
			const updated = {
				...previous,
				...(typeof targetInput !== 'undefined' ? { target: targetInput } : {}),
				...(typeof label !== 'undefined' ? (label ? { label } : { label: undefined }) : {}),
				...(typeof enabled !== 'undefined' ? { enabled } : {}),
				updated_at: new DateTime()
			};

			try {
				await sendTestNotificationToTarget(updated.target);
			} catch (error) {
				return { failed: true as const, message: (error as Error).message };
			}

			current[index] = updated;
			const targets = await saveUserNotificationTargets(db, current);
			return { target: updated, targets };
		});

		if ('missing' in state) {
			return jsonError(event, 404, 'not_found', 'Notification target not found.');
		}
		if ('failed' in state) {
			return jsonError(
				event,
				502,
				'notification_test_failed',
				typeof state.message === 'string' ? state.message : 'Notification test failed.'
			);
		}

		return jsonOk(event, state);
	});
};

export const DELETE: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const targetId = decodeURIComponent(event.params.id).trim();
		if (!targetId) return jsonError(event, 400, 'bad_request', 'id is required.');

		const result = await withUserDb(auth.token, async (db) => {
			const current = await getUserNotificationTargets(db);
			const filtered = current.filter((item) => item.id !== targetId);
			if (filtered.length === current.length) return { missing: true as const };
			const targets = await saveUserNotificationTargets(db, filtered);
			return { targets };
		});

		if ('missing' in result) {
			return jsonError(event, 404, 'not_found', 'Notification target not found.');
		}
		return jsonOk(event, { deleted: true, targets: result.targets });
	});
};
