import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { getJob, queryMany, queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { parsePaginationParams } from '$lib/server/pagination';
import { RecordId } from 'surrealdb';

/**
 * @swagger
 * /api/v1/jobs/{id}/queue:
 *   get:
 *     tags: [JobQueue]
 *     summary: List queue tasks for the current job
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     responses:
 *       200:
 *         description: Job Queue task list
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const jobId = new RecordId('jobs', event.params.id);
	const job = await getJob(jobId, auth.token, isSuperuser(auth.user));
	if (!job) return jsonError(event, 404, 'not_found', 'Job not found.');

	const pagination = parsePaginationParams(event.url.searchParams);
	if (!pagination.ok) {
		return jsonError(event, 400, 'bad_request', pagination.message);
	}

	if (pagination.value.mode === 'all') {
		const rows = isSuperuser(auth.user)
			? await withAdminDb((db) =>
					queryMany(
						db,
						'SELECT * FROM job_queue WHERE job = $jobId ORDER BY created_at DESC;',
						{ jobId }
					)
				)
			: await withUserDb(auth.token, (db) =>
					queryMany(
						db,
						'SELECT * FROM job_queue WHERE job = $jobId ORDER BY created_at DESC;',
						{ jobId }
					)
				);
		return jsonOk(event, { tasks: rows ?? [] });
	}

	const { limit, offset, page, pageSize } = pagination.value;
	const rows = isSuperuser(auth.user)
		? await withAdminDb((db) =>
				queryMany(
					db,
					'SELECT * FROM job_queue WHERE job = $jobId ORDER BY created_at DESC LIMIT $limit START $offset;',
					{ jobId, limit, offset }
				)
			)
		: await withUserDb(auth.token, (db) =>
				queryMany(
					db,
					'SELECT * FROM job_queue WHERE job = $jobId ORDER BY created_at DESC LIMIT $limit START $offset;',
					{ jobId, limit, offset }
				)
			);
	const countRow = isSuperuser(auth.user)
		? await withAdminDb((db) =>
				queryOne<{ total_items: number }>(
					db,
					'SELECT count() AS total_items FROM job_queue WHERE job = $jobId GROUP ALL;',
					{ jobId }
				)
			)
		: await withUserDb(auth.token, (db) =>
				queryOne<{ total_items: number }>(
					db,
					'SELECT count() AS total_items FROM job_queue WHERE job = $jobId GROUP ALL;',
					{ jobId }
				)
			);

	return jsonOk(event, {
		tasks: rows ?? [],
		page,
		page_size: pageSize,
		total_items: Number(countRow?.total_items ?? 0)
	});
};
