import type { ApiWebsiteUrlSource } from '$lib/types/api';

export const WEBSITE_URL_SOURCES: ApiWebsiteUrlSource[] = [
	'migration',
	'manual',
	'seo',
	'wcag',
	'security',
	'sitemap',
	'crawl'
];

export const normalizeWebsiteUrl = (input: string, base?: string): string => {
	const parsed = base ? new URL(input, base) : new URL(input);
	parsed.hash = '';
	const params = [...parsed.searchParams.entries()]
		.filter(([key]) => !/^utm_/i.test(key) && !['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase()))
		.sort(([a], [b]) => a.localeCompare(b));
	parsed.search = '';
	for (const [key, value] of params) parsed.searchParams.append(key, value);
	if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
	parsed.hostname = parsed.hostname.toLowerCase();
	return parsed.toString();
};

export const templateKeyForUrl = (input: string): string => {
	const parsed = new URL(input);
	const parts = parsed.pathname
		.split('/')
		.filter(Boolean)
		.map((part) => {
			const decoded = decodeURIComponent(part).toLowerCase();
			if (/^\d+$/.test(decoded)) return ':id';
			if (/^[0-9a-f]{8,}$/i.test(decoded)) return ':hash';
			if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(decoded)) return ':date';
			if (/^(page|p)-?\d+$/i.test(decoded)) return ':page';
			if (decoded.length > 40) return ':slug';
			return decoded.replace(/[0-9]+/g, ':n');
		});
	return `/${parts.join('/')}` || '/';
};
