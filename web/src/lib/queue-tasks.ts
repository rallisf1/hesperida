export const queueTaskStatuses = [
	'pending',
	'waiting',
	'processing',
	'completed',
	'failed',
	'canceled'
] as const;

export type QueueTaskStatus = (typeof queueTaskStatuses)[number];

export interface QueueTaskRow {
	id: string;
	job_id: string;
	type: string;
	website_url: string;
	target: string;
	status: QueueTaskStatus;
	created_at: string;
}

export interface QueueTaskSnapshotEvent {
	type: 'snapshot';
	tasks: QueueTaskRow[];
}

export interface QueueTaskUpsertEvent {
	type: 'upsert';
	task: QueueTaskRow;
}

export interface QueueTaskRemoveEvent {
	type: 'remove';
	id: string;
}

export type QueueTaskStreamEvent =
	| QueueTaskSnapshotEvent
	| QueueTaskUpsertEvent
	| QueueTaskRemoveEvent;

export const toRouteId = (recordId: string): string => {
	const value = recordId.trim();
	const parts = value.split(':');
	return parts.length > 1 ? parts.slice(1).join(':') : value;
};

export const isQueueTaskStatus = (value: unknown): value is QueueTaskStatus =>
	typeof value === 'string' && (queueTaskStatuses as readonly string[]).includes(value);
