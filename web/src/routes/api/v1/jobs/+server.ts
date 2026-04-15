import type { RequestHandler } from './$types';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryMany, queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { canCreateJob, isSuperuser } from '$lib/server/policy';
import { withRequiredUser } from '$lib/server/route';
import { tools as ALLOWED_TOOLS } from '$lib/constants';
import type { Tool, Website } from '$lib/types';
import { parsePaginationParams } from '$lib/server/pagination';
import { verifyWebsiteOwnership } from '$lib/server/website-verification';
import { RecordId } from 'surrealdb';

/**
 * @swagger
 * /api/v1/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: List jobs
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Job list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobsListEnvelope'
 */
export const GET: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		const pagination = parsePaginationParams(event.url.searchParams);
		if (!pagination.ok) {
			return jsonError(event, 400, 'bad_request', pagination.message);
		}

		if (pagination.value.mode === 'all') {
			if (isSuperuser(auth.user)) {
				const rows = await withAdminDb((db) => queryMany(db, 'SELECT * FROM jobs ORDER BY created_at DESC;'));
				return jsonOk(event, { jobs: rows ?? [] });
			}
			const rows = await withUserDb(auth.token, (db) =>
				queryMany(db, 'SELECT * FROM jobs ORDER BY created_at DESC;')
			);
			return jsonOk(event, { jobs: rows ?? [] });
		}

		const { limit, offset, page, pageSize } = pagination.value;
		if (isSuperuser(auth.user)) {
			const rows = await withAdminDb((db) =>
				queryMany(db, 'SELECT * FROM jobs ORDER BY created_at DESC LIMIT $limit START $offset;', {
					limit,
					offset
				})
			);
			const countRow = await withAdminDb((db) =>
				queryOne<{ total_items: number }>(db, 'SELECT count() AS total_items FROM jobs GROUP ALL;')
			);
			return jsonOk(event, {
				jobs: rows ?? [],
				page,
				page_size: pageSize,
				total_items: Number(countRow?.total_items ?? 0)
			});
		}
		const rows = await withUserDb(auth.token, (db) =>
			queryMany(db, 'SELECT * FROM jobs ORDER BY created_at DESC LIMIT $limit START $offset;', {
				limit,
				offset
			})
		);
		const countRow = await withUserDb(auth.token, (db) =>
			queryOne<{ total_items: number }>(db, 'SELECT count() AS total_items FROM jobs GROUP ALL;')
		);
		return jsonOk(event, {
			jobs: rows ?? [],
			page,
			page_size: pageSize,
			total_items: Number(countRow?.total_items ?? 0)
		});
	});
};

/**
 * @swagger
 * /api/v1/jobs:
 *   post:
 *     tags: [Jobs]
 *     summary: Create job
 *     description: Non-viewers only. Jobs are automatically parsed into job queue tasks and executed by the orchestrator.
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [website, types]
 *             properties:
 *               website: { type: string }
 *               types:
 *                 type: array
 *                 items: { type: string }
 *               options: { type: object }
 *     responses:
 *       201:
 *         description: Job created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobEnvelope'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const POST: RequestHandler = async (event) => {
	return withRequiredUser(event, async (auth) => {
		if (!canCreateJob(auth.user)) {
			return jsonError(event, 403, 'forbidden', 'Viewer users cannot create jobs.');
		}

		let payload: Record<string, unknown>;
		try {
			payload = await parseJson(event.request);
		} catch (error) {
			return jsonError(event, 400, 'bad_request', (error as Error).message);
		}

		const website = typeof payload.website === 'string' ? new RecordId('websites', payload.website) : null;
		const types = Array.isArray(payload.types)
			? payload.types.filter(
					(item): item is Tool =>
						typeof item === 'string' && ALLOWED_TOOLS.includes(item as Tool)
				)
			: [];
		const options =
			payload.options && typeof payload.options === 'object' && !Array.isArray(payload.options)
				? payload.options
				: null;

		if (!website) return jsonError(event, 400, 'bad_request', 'website is required.');

		let websiteRow = await (isSuperuser(auth.user)
			? withAdminDb((db) =>
					queryOne<Website & { owner_group?: string | null }>(
						db,
						'SELECT id, url, verification_id, owner.group as owner_group FROM websites WHERE id = $id LIMIT 1;',
						{ id: website }
					)
				)
			: withUserDb(auth.token, (db) =>
					queryOne<Website>(
						db,
						'SELECT id, url, verification_id FROM websites WHERE id = $id LIMIT 1;',
						{ id: website }
					)
				));
		if (!websiteRow) return jsonError(event, 404, 'not_found', 'Website not found.');

		const group = isSuperuser(auth.user)
			? (websiteRow as Website & { owner_group?: string | null }).owner_group ?? auth.user.group
			: auth.user.group;
		const verification = await verifyWebsiteOwnership(websiteRow, group);

		if (!verification.verified) {
			return jsonError(
				event,
				403,
				'website_not_verified',
				'Cannot create jobs for unverified websites',
				verification
			);
		}

		try {
			const createJob = async (db: Parameters<typeof queryOne>[0]) => {
				const createPayload: Record<string, unknown> = { website };
				let sql = 'CREATE jobs CONTENT { website: $website, status: "pending"';
				if (types.length) {
					sql += ', types: $types';
					createPayload.types = types;
				}
				if (options) {
					sql += ', options: $options';
					createPayload.options = options;
				}
				sql += '} RETURN AFTER;';
				return queryOne(db, sql, createPayload);
			};

			const job = await (isSuperuser(auth.user)
				? withAdminDb((db) => createJob(db))
				: withUserDb(auth.token, (db) => createJob(db)));

			return jsonOk(event, { job }, 201);
		} catch (error) {
			return jsonError(event, 400, 'create_failed', (error as Error).message);
		}
	});
};
