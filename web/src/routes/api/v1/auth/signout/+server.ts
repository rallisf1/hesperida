import type { RequestHandler } from './$types';
import { clearSessionCookies } from '$lib/server/auth';
import { getAuthToken } from '$lib/server/auth';
import { withUserDb } from '$lib/server/db';
import { jsonOk } from '$lib/server/http';

/**
 * @swagger
 * /api/v1/auth/signout:
 *   post:
 *     tags: [Auth]
 *     summary: Sign out
 *     responses:
 *       200:
 *         description: Signed out
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
export const POST: RequestHandler = async (event) => {
	const token = getAuthToken(event);
	if (token) {
		try {
			await withUserDb(token, async (db) => {
				await db.invalidate();
			});
		} catch {
			// Ignore invalidate errors and continue clearing cookie.
		}
	}

	clearSessionCookies(event);
	return jsonOk(event, { success: true });
};
