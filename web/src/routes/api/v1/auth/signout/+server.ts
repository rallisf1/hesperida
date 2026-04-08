import type { RequestHandler } from './$types';
import { config } from '$lib/server/config';
import { getAuthToken } from '$lib/server/auth';
import { withUserDb } from '$lib/server/db';
import { jsonOk } from '$lib/server/http';

/**
 * @swagger
 * /api/v1/auth/signout:
 *   post:
 *     tags: [Auth]
 *     summary: Sign out and clear session cookie
 *     responses:
 *       200:
 *         description: Signed out
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

	event.cookies.delete(config.sessionCookieName, { path: '/' });
	return jsonOk(event, { success: true });
};
