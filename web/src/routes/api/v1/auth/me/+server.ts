import type { RequestHandler } from './$types';
import { getCurrentUser } from '$lib/server/auth';
import { jsonError, jsonOk } from '$lib/server/http';

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get my account
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthCurrentUserEnvelope'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const GET: RequestHandler = async (event) => {
	const token = event.locals.authToken;
	if (!token) return jsonError(event, 401, 'unauthorized', 'Authentication required.');

	const user = await getCurrentUser(token);
	if (!user) return jsonError(event, 401, 'unauthorized', 'Invalid or expired session.');

	return jsonOk(event, { user });
};
