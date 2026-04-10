import type { PageServerLoad } from './$types';
import { queryMany, withUserDb } from '$lib/server/db';
import { mapQueueTaskRow } from '$lib/server/queue-tasks';

const DEFAULT_LIMIT = 100;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.authToken) {
		return { tasks: [] };
	}

	const rows = await withUserDb(locals.authToken, (db) =>
		queryMany<Record<string, unknown>>(
			db,
			'SELECT * FROM job_queue ORDER BY created_at DESC LIMIT $limit FETCH job.website;',
			{ limit: DEFAULT_LIMIT }
		)
	);

	return {
		tasks: rows.map(mapQueueTaskRow),
	};
};
