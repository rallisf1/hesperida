import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb } from '$lib/server/db';
import { isAdmin } from '$lib/server/policy';
import { verifyWebsiteOwnership } from '$lib/server/website-verification';
import { config } from '$lib/server/config';
import type { Website } from '$lib/types';
import { RecordId } from 'surrealdb';

const getAccessibleWebsite = async (
	websiteId: RecordId,
	userId: RecordId,
	isUserAdmin: boolean
): Promise<Website | null> =>
	withAdminDb((db) =>
		queryOne<Website>(
			db,
			isUserAdmin
				? 'SELECT id, url, verification_code, verified_at FROM websites WHERE id = $id LIMIT 1;'
				: 'SELECT id, url, verification_code, verified_at FROM websites WHERE id = $id AND (owner = $user OR $user IN users) LIMIT 1;',
			{ id: websiteId, user: userId }
		)
	);

/**
 * @swagger
 * /api/v1/websites/{id}/verify:
 *   get:
 *     tags: [Websites]
 *     summary: Verify website ownership using DNS TXT and HTTP fallback
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
 *         description: Verification result
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/GeneralError'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const routeId = event.params.id;
	if (!routeId) return jsonError(event, 400, 'bad_request', 'Website id is required.');
	const websiteId = new RecordId('websites', routeId);

	const accessible = await getAccessibleWebsite(websiteId, auth.user.id, isAdmin(auth.user));
	if (!accessible) {
		return jsonError(event, 404, 'not_found', 'Website not found.');
	}

	const verification = await verifyWebsiteOwnership(accessible);

	const result = {
		website_id: websiteId,
		verification: {
			verified: verification.verified,
			method: verification.method,
			txt_host: verification.txtHost,
			txt_value: verification.txtValue,
			http_url: verification.httpUrl,
			errors: verification.errors ?? null,
			ttl_seconds: config.websiteVerificationTtlSeconds
		}
	};
	return verification.verified ?
		jsonOk(event, result)
		: jsonError(event, 422, 'verification_failed', 'Could not verify website', result);
};
