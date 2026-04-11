import type { PageServerLoad } from './$types';
import { queryMany, queryOne, withUserDb } from '$lib/server/db';
import { mapQueueTaskRow } from '$lib/server/queue-tasks';
import { toRouteId } from '$lib/server/record-id';
import type { DateTime } from 'surrealdb';
import type { Queue, Website } from '$lib/types';

const DEFAULT_TASK_LIMIT = 100;
const THROUGHPUT_DAYS = 14;

type WebsitePoint = {
	id: string;
	url: string;
	created_at: string;
};

type LatencyPoint = {
	job_id: string;
	website_url: string;
	response_time: string;
	latency_ms: number;
	created_at: string;
};

const toIso = (value: unknown): string => {
	if (!value) return '';
	if (typeof value === 'string') return value;
	return String(value);
};

const parseLatencyMs = (value: string): number | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim().toLowerCase();
	const match = trimmed.match(/([0-9]+(?:\.[0-9]+)?)\s*(ms|s)?/i);
	if (!match) return null;
	const amount = Number.parseFloat(match[1] ?? '');
	if (!Number.isFinite(amount)) return null;
	const unit = (match[2] ?? 'ms').toLowerCase();
	return unit === 's' ? amount * 1000 : amount;
};

const buildScoreStats = async (
	db: Parameters<typeof withUserDb>[1] extends (db: infer T) => Promise<unknown> ? T : never,
	table: string
) => {
	const best = await queryOne<{ score?: number; created_at?: DateTime; website_url?: string; job_id?: string }>(
		db,
		`SELECT score, created_at, job.id AS job_id, job.website.url AS website_url FROM ${table} WHERE score != NONE ORDER BY score DESC, created_at DESC LIMIT 1 FETCH job.website;`
	);
	const worst = await queryOne<{ score?: number; created_at?: DateTime; website_url?: string; job_id?: string }>(
		db,
		`SELECT score, created_at, job.id AS job_id, job.website.url AS website_url FROM ${table} WHERE score != NONE ORDER BY score ASC, created_at DESC LIMIT 1 FETCH job.website;`
	);

	return {
		best: best?.score != null ? { job_id: toRouteId(best.job_id), website_url: best.website_url ?? '', score: Number(best.score), created_at: toIso(best.created_at) } : null,
		worst: worst?.score != null ? { job_id: toRouteId(worst.job_id), website_url: worst.website_url ?? '', score: Number(worst.score), created_at: toIso(worst.created_at) } : null,
	};
};

const startOfDayUtc = (date: Date): string => {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	return d.toISOString().slice(0, 10);
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.authToken) {
		return {
			tasks: [],
			latestWebsites: [],
			throughput: [],
			toolUsage: [],
			unverifiedCount: 0,
			queueHealth: { waiting: 0, processing: 0, failed: 0 },
			seo: { best: null, worst: null },
			wcag: { best: null, worst: null },
			security: { best: null, worst: null },
			latency: { best: null, worst: null }
		};
	}

	return withUserDb(locals.authToken, async (db) => {
		const taskRows = await queryMany<Queue>(
			db,
			'SELECT * FROM job_queue ORDER BY created_at DESC LIMIT $limit FETCH job.website;',
			{ limit: DEFAULT_TASK_LIMIT }
		);

		const websites = await queryMany<Website>(
			db,
			'SELECT id, url, created_at FROM websites ORDER BY created_at DESC LIMIT 8;'
		);
		const latestWebsites: WebsitePoint[] = websites.map((item) => ({
			id: toRouteId(item.id),
			url: item.url ?? '',
			created_at: toIso(item.created_at)
		}));

		const websiteTotals = await queryOne<{ total?: number; verified?: number }>(
			db,
			'SELECT count() AS total, count(verified_at IS NOT NONE) AS verified FROM websites GROUP ALL;'
		);

		const seo = await buildScoreStats(db, 'seo_results');
		const wcag = await buildScoreStats(db, 'wcag_results');
		const security = await buildScoreStats(db, 'security_results');

		const latencyRows = await queryMany<{ job_id?: string; response_time?: string; created_at?: DateTime; website_url?: string }>(
			db,
			'SELECT job.id AS job_id, response_time, created_at, job.website.url AS website_url FROM probe_results ORDER BY created_at DESC LIMIT 2000 FETCH job.website;'
		);
		const latencyCandidates: LatencyPoint[] = latencyRows
			.map((row) => ({
				job_id: toRouteId(row.job_id),
				website_url: row.website_url ?? '',
				response_time: row.response_time ?? '',
				latency_ms: parseLatencyMs(row.response_time ?? '') ?? Number.NaN,
				created_at: toIso(row.created_at)
			}))
			.filter((row) => Number.isFinite(row.latency_ms));

		latencyCandidates.sort((a, b) => {
			if (a.latency_ms === b.latency_ms) {
				return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			}
			return a.latency_ms - b.latency_ms;
		});

		const probe = {
			best: latencyCandidates.length ? latencyCandidates[0] : null,
			worst: latencyCandidates.length ? latencyCandidates[latencyCandidates.length - 1] : null
		};

		const now = new Date();
		const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
		from.setUTCDate(from.getUTCDate() - (THROUGHPUT_DAYS - 1));

		const throughputSource = await queryMany<{ created_at?: DateTime; status?: string }>(
			db,
			'SELECT created_at, status FROM job_queue ORDER BY created_at DESC LIMIT 5000;'
		);

		const perDay = new Map<string, { completed: number; non_completed: number }>();
		for (let i = 0; i < THROUGHPUT_DAYS; i += 1) {
			const day = new Date(from);
			day.setUTCDate(from.getUTCDate() + i);
			perDay.set(startOfDayUtc(day), { completed: 0, non_completed: 0 });
		}

		for (const row of throughputSource) {
			const createdAt = new Date(toIso(row.created_at));
			if (Number.isNaN(createdAt.getTime()) || createdAt < from) continue;
			const day = startOfDayUtc(createdAt);
			const bucket = perDay.get(day);
			if (!bucket) continue;
			if (row.status === 'completed') bucket.completed += 1;
			else bucket.non_completed += 1;
		}

		const throughput = Array.from(perDay.entries()).map(([date, values]) => ({
			date,
			completed: values.completed,
			non_completed: values.non_completed
		}));

		const jobs = await queryMany<{ types?: string[] }>(
			db,
			'SELECT types, created_at FROM jobs ORDER BY created_at DESC LIMIT 1000;'
		);
		const toolCounts = new Map<string, number>();
		for (const row of jobs) {
			const types = Array.isArray(row.types) ? row.types : [];
			for (const type of types) {
				if (typeof type !== 'string' || type === "probe") continue;
				toolCounts.set(type, (toolCounts.get(type) ?? 0) + 1);
			}
		}
		const toolUsage = Array.from(toolCounts.entries())
			.map(([tool, count]) => ({ tool, count }))
			.sort((a, b) => b.count - a.count);


		const verified = Number(websiteTotals?.verified ?? 0);
		const total = Number(websiteTotals?.total ?? 0);
		const unverifiedCount = Math.max(0, total - verified);

		return {
			tasks: taskRows.map(mapQueueTaskRow),
			latestWebsites,
			throughput,
			toolUsage,
			unverifiedCount,
			seo,
			wcag,
			security,
			probe
		};
	});
};
