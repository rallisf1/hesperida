import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryMany, queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { parsePaginationParams } from '$lib/server/pagination';

/**
 * @swagger
 * /api/v1/job-queue:
 *   get:
 *     tags: [JobQueue]
 *     summary: List job queue tasks
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue task list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobQueueListEnvelope'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const pagination = parsePaginationParams(event.url.searchParams);
	if (!pagination.ok) {
		return jsonError(event, 400, 'bad_request', pagination.message);
	}

	if (pagination.value.mode === 'all') {
		const rows = isSuperuser(auth.user)
			? await withAdminDb((db) => queryMany(db, 'SELECT * FROM job_queue ORDER BY created_at DESC;'))
			: await withUserDb(auth.token, (db) => queryMany(db, 'SELECT * FROM job_queue ORDER BY created_at DESC;'));

		return jsonOk(event, { tasks: rows ?? [] });
	}

	const { limit, offset, page, pageSize } = pagination.value;
	const rows = isSuperuser(auth.user)
		? await withAdminDb((db) =>
				queryMany(db, 'SELECT * FROM job_queue ORDER BY created_at DESC LIMIT $limit START $offset;', {
					limit,
					offset
				})
			)
		: await withUserDb(auth.token, (db) =>
				queryMany(db, 'SELECT * FROM job_queue ORDER BY created_at DESC LIMIT $limit START $offset;', {
					limit,
					offset
				})
			);
	const countRow = isSuperuser(auth.user)
		? await withAdminDb((db) =>
				queryOne<{ total_items: number }>(db, 'SELECT count() AS total_items FROM job_queue GROUP ALL;')
			)
		: await withUserDb(auth.token, (db) =>
				queryOne<{ total_items: number }>(db, 'SELECT count() AS total_items FROM job_queue GROUP ALL;')
			);

	return jsonOk(event, {
		tasks: rows ?? [],
		page,
		page_size: pageSize,
		total_items: Number(countRow?.total_items ?? 0)
	});
};
