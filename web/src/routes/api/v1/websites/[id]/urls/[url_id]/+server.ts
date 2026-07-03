import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import { normalizeWebsiteUrl, templateKeyForUrl, WEBSITE_URL_SOURCES } from '$lib/server/website-urls';
import type { ApiWebsiteUrl, ApiWebsiteUrlSource } from '$lib/types/api';

export const PATCH: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const id = new RecordId('website_urls', toRouteId(event.params.url_id));
	const website = new RecordId('websites', toRouteId(event.params.id));
	const patch: Record<string, unknown> = {};

	if (typeof payload.url === 'string') {
		try {
			const normalized = normalizeWebsiteUrl(payload.url.trim());
			patch.url = normalized;
			patch.normalized_url = normalized;
			patch.template_key = templateKeyForUrl(normalized);
		} catch {
			return jsonError(event, 400, 'bad_request', 'url must be a valid absolute URL.');
		}
	}
	if (WEBSITE_URL_SOURCES.includes(payload.source as ApiWebsiteUrlSource)) patch.source = payload.source;
	if (typeof payload.status_code === 'number') patch.status_code = Math.trunc(payload.status_code);
	if (typeof payload.content_type === 'string') patch.content_type = payload.content_type.trim();
	if (typeof payload.selected === 'boolean') patch.selected = payload.selected;
	if (typeof payload.manual === 'boolean') patch.manual = payload.manual;
	if (typeof payload.excluded === 'boolean') patch.excluded = payload.excluded;
	if (typeof payload.template_key === 'string') patch.template_key = payload.template_key.trim();
	if (typeof payload.template_label === 'string') patch.template_label = payload.template_label.trim();
	if (typeof payload.last_seen_at === 'string') patch.last_seen_at = payload.last_seen_at;

	if (!Object.keys(patch).length) {
		return jsonError(event, 400, 'bad_request', 'At least one updatable field is required.');
	}

	try {
		const updated = await (isSuperuser(auth.user)
			? withAdminDb((db) =>
					queryOne<ApiWebsiteUrl>(
						db,
						'UPDATE website_urls MERGE $patch WHERE id = $id AND website = $website RETURN AFTER;',
						{ id, website, patch }
					)
				)
			: withUserDb(auth.token, (db) =>
					queryOne<ApiWebsiteUrl>(
						db,
						'UPDATE website_urls MERGE $patch WHERE id = $id AND website = $website RETURN AFTER;',
						{ id, website, patch }
					)
				));
		if (!updated) return jsonError(event, 404, 'not_found', 'Website URL not found.');
		return jsonOk(event, { url: updated });
	} catch (error) {
		return jsonError(event, 400, 'update_failed', (error as Error).message);
	}
};
