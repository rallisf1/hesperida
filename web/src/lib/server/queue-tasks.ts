import type { QueueTaskRow, QueueTaskStatus } from '$lib/queue-tasks';
import { isQueueTaskStatus } from '$lib/queue-tasks';
import { normalizeRecordId, toRouteId } from './record-id';

type RawQueueTask = Record<string, unknown>;

const toIsoDate = (value: unknown): string => {
	if (!value) return new Date(0).toISOString();
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'toString' in value) {
		const output = String((value as { toString: () => string }).toString());
		if (output && output !== '[object Object]') return output;
	}
	return new Date(0).toISOString();
};

const toStatus = (value: unknown): QueueTaskStatus =>
	isQueueTaskStatus(value) ? value : 'pending';

const extractWebsiteUrl = (row: RawQueueTask): string => {
	const job = row.job as Record<string, unknown> | string | undefined;
	if (job && typeof job === 'object') {
		const website = job.website as Record<string, unknown> | string | undefined;
		if (website && typeof website === 'object' && typeof website.url === 'string') {
			return website.url;
		}
	}
	return '';
};

const extractJobId = (row: RawQueueTask): string => {
	const job = row.job as Record<string, unknown> | string | undefined;
	if (job && typeof job === 'object' && typeof job.id !== 'undefined') {
		return toRouteId(normalizeRecordId(job.id));
	}
	if (typeof job === 'string') {
		return toRouteId(normalizeRecordId(job));
	}
	return '';
};

export const mapQueueTaskRow = (row: RawQueueTask): QueueTaskRow => {
	const id = toRouteId(normalizeRecordId(row.id));
	return {
		id,
		job_id: extractJobId(row),
		type: typeof row.type === 'string' ? row.type : '',
		website_url: extractWebsiteUrl(row),
		target: typeof row.target === 'string' ? row.target : '',
		status: toStatus(row.status),
		created_at: toIsoDate(row.created_at)
	};
};
