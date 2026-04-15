import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { ensureWebsiteVerification, verifyWebsiteOwnership } from '$lib/server/website-verification';
import type { Website } from '$lib/types';
import { RecordId } from 'surrealdb';

type AccessibleWebsite = Website & { owner_group?: string | null };

const getAccessibleWebsite = async (
	websiteId: RecordId,
	isUserSuperuser: boolean,
	token: string
): Promise<AccessibleWebsite | null> =>
	isUserSuperuser
		? withAdminDb((db) =>
				queryOne<AccessibleWebsite>(
					db,
					'SELECT id, url, verification_id, owner.group as owner_group FROM websites WHERE id = $id LIMIT 1;',
					{ id: websiteId }
				)
			)
		: withUserDb(token, (db) =>
				queryOne<AccessibleWebsite>(
					db,
					'SELECT id, url, verification_id FROM websites WHERE id = $id LIMIT 1;',
					{ id: websiteId }
				)
			);

/**
 * @swagger
 * /api/v1/websites/{id}/verify:
 *   get:
 *     tags: [Websites]
 *     summary: Verify website
 *     description: Verifies ownership using DNS TXT and HTTP (web root file) as fallback
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteVerificationEnvelope'
 *       409:
 *         description: Website is already verified
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

	const accessible = await getAccessibleWebsite(
		websiteId,
		isSuperuser(auth.user),
		auth.token
	);
	if (!accessible) {
		return jsonError(event, 404, 'not_found', 'Website not found.');
	}
	const group = isSuperuser(auth.user) ? accessible.owner_group ?? auth.user.group : auth.user.group;
	const verificationRecord = await ensureWebsiteVerification(accessible, group);
	if (!verificationRecord) {
		return jsonError(event, 422, 'verification_failed', 'Unable to load verification record.');
	}
	if (verificationRecord.verified_at) {
		const cached = await verifyWebsiteOwnership(accessible, group);
		return jsonError(event, 409, 'already_verified', 'Website is already verified.', {
			website_id: websiteId,
			verification: {
				verified: cached.verified,
				method: cached.method,
				txt_host: cached.txtHost,
				txt_value: cached.txtValue,
				http_url: cached.httpUrl,
				errors: cached.errors ?? null
			}
		});
	}

	const verification = await verifyWebsiteOwnership(accessible, group);

	const result = {
		website_id: websiteId,
		verification: {
			verified: verification.verified,
			method: verification.method,
			txt_host: verification.txtHost,
			txt_value: verification.txtValue,
			http_url: verification.httpUrl,
			errors: verification.errors ?? null
		}
	};
	return verification.verified ?
		jsonOk(event, result)
		: jsonError(event, 422, 'verification_failed', 'Could not verify website', result);
};
