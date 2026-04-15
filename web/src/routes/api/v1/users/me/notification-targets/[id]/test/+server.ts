import type { RequestHandler } from './$types';
import { withRequiredUser } from '$lib/server/route';
import { jsonError, jsonOk } from '$lib/server/http';
import { withUserDb } from '$lib/server/db';
import { sendTestNotificationToTarget } from '$lib/server/notifications';
import { getUserNotificationTargets } from '$lib/server/notifications/store';

/**
 * @swagger
 * /api/v1/users/me/notification-targets/{id}/test:
 *   post:
 *     tags: [Users]
 *     summary: Test notification
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       502:
 *         description: Test failed
 */
export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const targetId = decodeURIComponent(event.params.id).trim();
		if (!targetId) return jsonError(event, 400, 'bad_request', 'id is required.');

		const target = await withUserDb(auth.token, async (db) => {
			const targets = await getUserNotificationTargets(db);
			return targets.find((item) => item.id === targetId) ?? null;
		});
		if (!target) {
			return jsonError(event, 404, 'not_found', 'Notification target not found.');
		}

		try {
			await sendTestNotificationToTarget(target.target);
		} catch (error) {
			return jsonError(event, 502, 'notification_test_failed', (error as Error).message);
		}

		return jsonOk(event, { tested: true, target });
	});
};
