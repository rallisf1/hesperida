import { queryOne, withAdminDb } from '$lib/server/db';

export const createUniqueGroup = async (): Promise<string> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const candidate = crypto.randomUUID();
		const existing = await withAdminDb((db) =>
			queryOne<{ id: string }>(db, 'SELECT id FROM users WHERE `group` = $group LIMIT 1;', {
				group: candidate
			})
		);
		if (!existing?.id) return candidate;
	}

	throw new Error('Unable to allocate unique group id.');
};
