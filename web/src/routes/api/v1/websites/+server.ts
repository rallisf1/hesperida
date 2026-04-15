import type { RequestHandler } from './$types';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryMany, queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { canCreateWebsite, isSuperuser } from '$lib/server/policy';
import { withRequiredUser } from '$lib/server/route';
import { parsePaginationParams } from '$lib/server/pagination';
import { ensureWebsiteVerification } from '$lib/server/website-verification';
import type { Website } from '$lib/types';

const websiteSelectSql =
	'SELECT *, verification_id.verification_code as verification_code, verification_id.verified_at as verified_at, verification_id.verification_method as verification_method FROM websites';

/**
 * @swagger
 * /api/v1/websites:
 *   get:
 *     tags: [Websites]
 *     summary: List websites
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Website list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsitesListEnvelope'
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const pagination = parsePaginationParams(event.url.searchParams);
		if (!pagination.ok) {
			return jsonError(event, 400, 'bad_request', pagination.message);
		}

		if (pagination.value.mode === 'all') {
			if (isSuperuser(auth.user)) {
				const rows = await withAdminDb((db) =>
					queryMany(db, `${websiteSelectSql} ORDER BY created_at DESC;`)
				);
				return jsonOk(event, { websites: rows ?? [] });
			}

			const rows = await withUserDb(auth.token, (db) =>
				queryMany(db, `${websiteSelectSql} ORDER BY created_at DESC;`)
			);
			return jsonOk(event, { websites: rows ?? [] });
		}

		const { limit, offset, page, pageSize } = pagination.value;
		if (isSuperuser(auth.user)) {
			const rows = await withAdminDb((db) =>
				queryMany(db, `${websiteSelectSql} ORDER BY created_at DESC LIMIT $limit START $offset;`, {
					limit,
					offset
				})
			);
			const countRow = await withAdminDb((db) =>
				queryOne<{ total_items: number }>(db, 'SELECT count() AS total_items FROM websites GROUP ALL;')
			);
			return jsonOk(event, {
				websites: rows ?? [],
				page,
				page_size: pageSize,
				total_items: Number(countRow?.total_items ?? 0)
			});
		}

		const rows = await withUserDb(auth.token, (db) =>
			queryMany(db, `${websiteSelectSql} ORDER BY created_at DESC LIMIT $limit START $offset;`, {
				limit,
				offset
			})
		);
		const countRow = await withUserDb(auth.token, (db) =>
			queryOne<{ total_items: number }>(db, 'SELECT count() AS total_items FROM websites GROUP ALL;')
		);
		return jsonOk(event, {
			websites: rows ?? [],
			page,
			page_size: pageSize,
			total_items: Number(countRow?.total_items ?? 0)
		});
	});
};

/**
 * @swagger
 * /api/v1/websites:
 *   post:
 *     tags: [Websites]
 *     summary: Create website
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, description]
 *             properties:
 *               url: { type: string }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Website created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteEnvelope'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (!canCreateWebsite(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Viewer users cannot create websites.');
		}

		let payload: Record<string, unknown>;
		try {
			payload = await parseJson(event.request);
		} catch (error) {
			return jsonError(event, 400, 'bad_request', (error as Error).message);
		}

		const url = typeof payload.url === 'string' ? payload.url.trim() : '';
		const description = typeof payload.description === 'string' ? payload.description.trim() : '';

		if (!url) {
			return jsonError(event, 400, 'bad_request', 'url is required.');
		}

		try {
			const website = await (isSuperuser(auth.user)
				? withAdminDb((db) =>
						queryOne<Website>(
							db,
							'CREATE websites CONTENT { owner: $user, users: [], url: $url, description: $description, verification_id: NONE } RETURN AFTER;',
							{ user: auth.user.id, url, description }
						)
					)
				: withUserDb(auth.token, (db) =>
						queryOne<Website>(
							db,
							'CREATE websites CONTENT { owner: $user, users: [], url: $url, description: $description, verification_id: NONE } RETURN AFTER;',
							{ user: auth.user.id, url, description }
						)
					));

			if (!website) {
				return jsonError(event, 400, 'create_failed', 'Failed to create website.');
			}

			await ensureWebsiteVerification(website, auth.user.group);

			const websiteWithVerification = await (isSuperuser(auth.user)
				? withAdminDb((db) =>
						queryOne(
							db,
							`${websiteSelectSql} WHERE id = $id LIMIT 1;`,
							{ id: website.id }
						)
					)
				: withUserDb(auth.token, (db) =>
						queryOne(
							db,
							`${websiteSelectSql} WHERE id = $id LIMIT 1;`,
							{ id: website.id }
						)
					));

			return jsonOk(event, { website: websiteWithVerification ?? website }, 201);
		} catch (error) {
			return jsonError(event, 400, 'create_failed', (error as Error).message);
		}
	});
};
