import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { jsonError, jsonOk, parseJson } from '$lib/server/http';
import { queryMany, queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import { normalizeWebsiteUrl, templateKeyForUrl, WEBSITE_URL_SOURCES } from '$lib/server/website-urls';
import type { ApiWebsiteUrl, ApiWebsiteUrlSource } from '$lib/types/api';

const selectSql = 'SELECT * FROM website_urls WHERE website = $website ORDER BY selected DESC, manual DESC, url ASC;';

export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const website = new RecordId('websites', toRouteId(event.params.id));
	const urls = await (isSuperuser(auth.user)
		? withAdminDb((db) => queryMany<ApiWebsiteUrl>(db, selectSql, { website }))
		: withUserDb(auth.token, (db) => queryMany<ApiWebsiteUrl>(db, selectSql, { website })));

	return jsonOk(event, { urls: urls ?? [] });
};

export const POST: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	let payload: Record<string, unknown>;
	try {
		payload = await parseJson(event.request);
	} catch (error) {
		return jsonError(event, 400, 'bad_request', (error as Error).message);
	}

	const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : '';
	if (!rawUrl) return jsonError(event, 400, 'bad_request', 'url is required.');

	const source = WEBSITE_URL_SOURCES.includes(payload.source as ApiWebsiteUrlSource)
		? (payload.source as ApiWebsiteUrlSource)
		: 'manual';
	const website = new RecordId('websites', toRouteId(event.params.id));

	let normalized: string;
	try {
		normalized = normalizeWebsiteUrl(rawUrl);
	} catch {
		return jsonError(event, 400, 'bad_request', 'url must be a valid absolute URL.');
	}

	try {
		const url = await (isSuperuser(auth.user)
			? withAdminDb((db) =>
					queryOne<ApiWebsiteUrl>(
						db,
						`UPSERT website_urls CONTENT {
							website: $website,
							url: $url,
							normalized_url: $normalized,
							source: $source,
							selected: $selected,
							manual: $manual,
							excluded: $excluded,
							template_key: $templateKey,
							template_label: $templateLabel,
							last_seen_at: time::now()
						} RETURN AFTER;`,
						{
							website,
							url: normalized,
							normalized,
							source,
							selected: payload.selected === true,
							manual: source === 'manual' || payload.manual === true,
							excluded: payload.excluded === true,
							templateKey: templateKeyForUrl(normalized),
							templateLabel: typeof payload.template_label === 'string' ? payload.template_label.trim() : null
						}
					)
				)
			: withUserDb(auth.token, (db) =>
					queryOne<ApiWebsiteUrl>(
						db,
						`UPSERT website_urls CONTENT {
							website: $website,
							url: $url,
							normalized_url: $normalized,
							source: $source,
							selected: $selected,
							manual: $manual,
							excluded: $excluded,
							template_key: $templateKey,
							template_label: $templateLabel,
							last_seen_at: time::now()
						} RETURN AFTER;`,
						{
							website,
							url: normalized,
							normalized,
							source,
							selected: payload.selected === true,
							manual: source === 'manual' || payload.manual === true,
							excluded: payload.excluded === true,
							templateKey: templateKeyForUrl(normalized),
							templateLabel: typeof payload.template_label === 'string' ? payload.template_label.trim() : null
						}
					)
				));

		return jsonOk(event, { url }, 201);
	} catch (error) {
		return jsonError(event, 400, 'create_failed', (error as Error).message);
	}
};
