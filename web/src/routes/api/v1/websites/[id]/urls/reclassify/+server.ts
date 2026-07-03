import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk } from '$lib/server/http';
import { queryMany, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import { templateKeyForUrl } from '$lib/server/website-urls';
import type { ApiWebsiteUrl } from '$lib/types/api';

export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const website = new RecordId('websites', toRouteId(event.params.id));

	try {
		const updated = await (isSuperuser(auth.user)
			? withAdminDb(async (db) => {
					const rows = await queryMany<ApiWebsiteUrl>(db, 'SELECT * FROM website_urls WHERE website = $website;', { website });
					for (const row of rows ?? []) {
						if (!row.id || !row.normalized_url) continue;
						await db
							.query('UPDATE $id SET template_key = $templateKey, template_label = $templateKey;', {
								id: row.id,
								templateKey: templateKeyForUrl(row.normalized_url)
							})
							.collect();
					}
					return rows?.length ?? 0;
				})
			: withUserDb(auth.token, async (db) => {
					const rows = await queryMany<ApiWebsiteUrl>(db, 'SELECT * FROM website_urls WHERE website = $website;', { website });
					for (const row of rows ?? []) {
						if (!row.id || !row.normalized_url) continue;
						await db
							.query('UPDATE $id SET template_key = $templateKey, template_label = $templateKey;', {
								id: row.id,
								templateKey: templateKeyForUrl(row.normalized_url)
							})
							.collect();
					}
					return rows?.length ?? 0;
				}));

		return jsonOk(event, { updated });
	} catch (error) {
		return jsonError(event, 400, 'reclassify_failed', (error as Error).message);
	}
};
