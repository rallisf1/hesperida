import { RecordId, Surreal, Table } from 'surrealdb';

type Website = {
	id: RecordId<'websites'>;
	owner?: RecordId<'users'>;
	users?: RecordId<'users'>[];
	url: string;
	description?: string;
	verification_id?: RecordId<'website_verifications'> | null;
	created_at?: unknown;
};

type Job = {
	id: RecordId<'jobs'>;
	website: RecordId<'websites'>;
	types?: string[];
	options?: Record<string, unknown> | null;
};

type Schedule = {
	id: RecordId<'schedule'>;
	job?: RecordId<'jobs'>;
	website?: RecordId<'websites'>;
	types?: string[];
	options?: Record<string, unknown> | null;
	cron?: string;
	enabled?: boolean;
	created?: RecordId<'jobs'>[];
};

const requiredEnv = (name: string): string => {
	const value = Bun.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
};

const normalizeUrl = (input: string): string => {
	const parsed = new URL(input);
	parsed.hash = '';
	parsed.search = '';
	if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
	parsed.hostname = parsed.hostname.toLowerCase();
	return parsed.toString();
};

const canonicalKey = (input: string): string => {
	const parsed = new URL(input);
	parsed.pathname = '/';
	parsed.search = '';
	parsed.hash = '';
	parsed.hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
	return parsed.toString();
};

const templateKeyForUrl = (input: string): string => {
	const parsed = new URL(input);
	const parts = parsed.pathname
		.split('/')
		.filter(Boolean)
		.map((part) => {
			const decoded = decodeURIComponent(part).toLowerCase();
			if (/^\d+$/.test(decoded)) return ':id';
			if (/^[0-9a-f]{8,}$/i.test(decoded)) return ':hash';
			if (/^(page|p)-?\d+$/i.test(decoded)) return ':page';
			if (decoded.length > 40) return ':slug';
			return decoded.replace(/[0-9]+/g, ':n');
		});
	return `/${parts.join('/')}` || '/';
};

const db = new Surreal();

await db.connect(`${requiredEnv('SURREAL_PROTOCOL') === 'https' ? 'wss' : 'ws'}://${requiredEnv('SURREAL_ADDRESS')}`, {
	namespace: requiredEnv('SURREAL_NAMESPACE'),
	database: requiredEnv('SURREAL_DATABASE'),
	authentication: {
		username: requiredEnv('SURREAL_USER'),
		password: requiredEnv('SURREAL_PASS')
	}
});

try {
	const websites = await db.select<Website>(new Table('websites'));
	const byKey = new Map<string, Website[]>();
	for (const website of websites) {
		try {
			const key = canonicalKey(website.url);
			const group = byKey.get(key) ?? [];
			group.push(website);
			byKey.set(key, group);
		} catch {
			console.warn(`Skipping invalid website URL for ${website.id}: ${website.url}`);
		}
	}

	const remap = new Map<string, RecordId<'websites'>>();
	let convertedUrls = 0;
	let removedWebsites = 0;

	for (const [key, group] of byKey.entries()) {
		group.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
		const canonical = group.find((item) => {
			try {
				return normalizeUrl(item.url) === key;
			} catch {
				return false;
			}
		}) ?? group[0]!;

		const rootUrl = key;
		if (normalizeUrl(canonical.url) !== rootUrl) {
			await db.update(canonical.id).merge({ url: rootUrl });
		}

		for (const website of group) {
			remap.set(website.id.toString(), canonical.id);
			const normalized = normalizeUrl(website.url);
			await db.query(
				`UPSERT website_urls CONTENT {
					website: $website,
					url: $url,
					normalized_url: $url,
					source: 'migration',
					selected: $selected,
					manual: true,
					excluded: false,
					template_key: $templateKey,
					template_label: $templateKey,
					last_seen_at: time::now()
				};`,
				{
					website: canonical.id,
					url: normalized,
					selected: website.id.toString() === canonical.id.toString(),
					templateKey: templateKeyForUrl(normalized)
				}
			).collect();
			convertedUrls++;
		}

		for (const duplicate of group.filter((item) => item.id.toString() !== canonical.id.toString())) {
			await db.query('UPDATE jobs SET website = $canonical WHERE website = $duplicate;', {
				canonical: canonical.id,
				duplicate: duplicate.id
			}).collect();
			await db.query('UPDATE website_notifications SET website = $canonical WHERE website = $duplicate;', {
				canonical: canonical.id,
				duplicate: duplicate.id
			}).collect();
			await db.delete(duplicate.id);
			removedWebsites++;
		}
	}

	const schedules = await db.select<Schedule>(new Table('schedule'));
	let migratedSchedules = 0;
	for (const schedule of schedules) {
		if (schedule.website && Array.isArray(schedule.types) && schedule.types.length) continue;
		if (!schedule.job) continue;
		const job = await db.select<Job>(schedule.job);
		if (!job?.website || !Array.isArray(job.types) || !job.types.length) continue;
		const website = remap.get(job.website.toString()) ?? job.website;
		await db.update(schedule.id).merge({
			website,
			types: job.types,
			options: job.options ?? {},
			created: schedule.created ?? [],
			enabled: schedule.enabled ?? true
		});
		migratedSchedules++;
	}

	console.log(JSON.stringify({ convertedUrls, removedWebsites, migratedSchedules }, null, 2));
} finally {
	await db.close();
}
