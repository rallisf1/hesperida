import { isValidUtcCron } from '$lib/cron';
import type { ApiSchedule, ApiScheduleRunJob } from '$lib/types/api';
import { normalizeRecordId } from './record-id';
import { queryMany, queryOne } from './db';
import { RecordId, type Surreal } from 'surrealdb';

type ScheduleRow = {
	id?: unknown;
	job?: unknown;
	job_types?: ApiSchedule['job_types'];
	cron?: string;
	created?: unknown[];
	enabled?: boolean;
	created_at?: unknown;
	updated_at?: unknown;
	job_id?: unknown;
	website_id?: unknown;
	website_url?: string;
	runs_count?: number;
};

type RunJobRow = {
	id?: unknown;
	status?: ApiScheduleRunJob['status'];
	types?: ApiScheduleRunJob['types'];
	website_id?: unknown;
	website_url?: string;
	created_at?: unknown;
};

export type ScheduleListFilters = {
	scheduleId?: RecordId<'schedule'>;
	jobId?: RecordId<'jobs'>;
	websiteId?: RecordId<'websites'>;
	limit?: number;
};

const rowId = (value: unknown): string => {
	if (value === null || typeof value === 'undefined') return '';
	return normalizeRecordId(value);
};

const toIso = (value: unknown): string => {
	if (!value) return '';
	if (typeof value === 'string') return value;
	if (value instanceof Date) return value.toISOString();
	return String(value);
};

const mapRunJob = (row: RunJobRow): ApiScheduleRunJob => ({
	id: rowId(row.id),
	status: row.status ?? 'pending',
	types: Array.isArray(row.types) ? row.types : [],
	website_id: row.website_id ? rowId(row.website_id) : undefined,
	website_url: row.website_url ?? '',
	created_at: toIso(row.created_at)
});

const enrichCreatedJobs = async (
	db: Surreal,
	createdIds: unknown[]
): Promise<ApiScheduleRunJob[]> => {
	const ids = (createdIds ?? []).filter(Boolean);
	if (!ids.length) return [];

	const rows = await queryMany<RunJobRow>(
		db,
		'SELECT id, status, types, website.id AS website_id, website.url AS website_url, created_at FROM jobs WHERE id IN $ids FETCH website;',
		{ ids }
	);

	const byId = new Map<string, ApiScheduleRunJob>();
	for (const row of rows) {
		byId.set(rowId(row.id), mapRunJob(row));
	}

	const ordered: ApiScheduleRunJob[] = [];
	for (const id of ids) {
		const key = rowId(id);
		const match = byId.get(key);
		if (match) ordered.push(match);
	}

	return ordered;
};

const mapScheduleRow = async (db: Surreal, row: ScheduleRow): Promise<ApiSchedule> => {
	const created = Array.isArray(row.created) ? row.created.map((id) => rowId(id)) : [];
	const createdJobs = await enrichCreatedJobs(db, row.created ?? []);

	return {
		id: rowId(row.id),
		job: rowId(row.job),
		job_id: row.job_id ? rowId(row.job_id) : undefined,
		job_types: Array.isArray(row.job_types) ? row.job_types : [],
		website_id: row.website_id ? rowId(row.website_id) : undefined,
		website_url: row.website_url ?? '',
		cron: row.cron ?? '',
		created,
		enabled: row.enabled ?? true,
		runs_count: Number(row.runs_count ?? created.length),
		created_jobs: createdJobs,
		created_at: toIso(row.created_at),
		updated_at: toIso(row.updated_at)
	};
};

const SCHEDULE_SELECT =
	'SELECT id, job, job.types AS job_types, cron, created, enabled, created_at, updated_at, job.id AS job_id, job.website.id AS website_id, job.website.url AS website_url, array::len(created ?? []) AS runs_count FROM schedule';

const buildWhere = (filters: ScheduleListFilters): { where: string; vars: Record<string, unknown> } => {
	const conditions: string[] = [];
	const vars: Record<string, unknown> = {};

	if (filters.scheduleId) {
		conditions.push('id = $scheduleId');
		vars.scheduleId = filters.scheduleId;
	}
	if (filters.jobId) {
		conditions.push('job = $jobId');
		vars.jobId = filters.jobId;
	}
	if (filters.websiteId) {
		conditions.push('job.website = $websiteId');
		vars.websiteId = filters.websiteId;
	}

	if (!conditions.length) return { where: '', vars };
	return { where: ` WHERE ${conditions.join(' AND ')}`, vars };
};

export const listSchedules = async (db: Surreal, filters: ScheduleListFilters = {}): Promise<ApiSchedule[]> => {
	const { where, vars } = buildWhere(filters);
	const limit = Number.isFinite(filters.limit) ? Number(filters.limit) : null;
	const sql = `${SCHEDULE_SELECT}${where} ORDER BY created_at DESC${limit ? ' LIMIT $limit' : ''};`;
	const rows = await queryMany<ScheduleRow>(db, sql, {
		...vars,
		...(limit ? { limit } : {})
	});

	const schedules: ApiSchedule[] = [];
	for (const row of rows) {
		schedules.push(await mapScheduleRow(db, row));
	}
	return schedules;
};

export const getSchedule = async (
	db: Surreal,
	scheduleId: RecordId<'schedule'>
): Promise<ApiSchedule | null> => {
	const list = await listSchedules(db, { scheduleId, limit: 1 });
	return list[0] ?? null;
};

export const normalizeCron = (value: string): string => value.trim().split(/\s+/).join(' ');

export const isValidScheduleCron = (value: string): boolean => {
	const normalized = normalizeCron(value);
	return isValidUtcCron(normalized);
};

export const ensureAccessibleJob = async (db: Surreal, jobId: RecordId<'jobs'>): Promise<boolean> => {
	const row = await queryOne<{ id?: unknown }>(db, 'SELECT id FROM jobs WHERE id = $id LIMIT 1;', { id: jobId });
	return Boolean(row?.id);
};
