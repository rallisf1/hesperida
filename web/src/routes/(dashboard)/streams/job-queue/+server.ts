import type { RequestHandler } from './$types';
import { produce } from 'sveltekit-sse';
import { Surreal, Table } from 'surrealdb';
import { config } from '$lib/server/config';
import { mapQueueTaskRow } from '$lib/server/queue-tasks';
import type { QueueTaskStreamEvent } from '$lib/queue-tasks';
import { queryMany, queryOne } from '$lib/server/db';
import { normalizeRecordId, toRouteId } from '$lib/server/record-id';
import type { Queue } from '$lib/types';

const DEFAULT_LIMIT = 100;
const isAuthError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error ?? '');
	const normalized = message.toLowerCase();
	return normalized.includes('session has expired') || normalized.includes('auth') || normalized.includes('not allowed');
};

const connectUserDb = async (token: string): Promise<Surreal> => {
	const db = new Surreal();
	await db.connect(config.surrealWsUrl, {
		namespace: config.surrealNamespace,
		database: config.surrealDatabase,
		...config.surrealOptions
	});
	await db.authenticate(token);
	return db;
};

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.authToken || !locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	let db: Surreal;
	try {
		db = await connectUserDb(locals.authToken);
	} catch (error) {
		if (isAuthError(error)) {
			return new Response('Unauthorized', { status: 401 });
		}
		return new Response('Service temporarily unavailable', { status: 503 });
	}
	let live: Awaited<ReturnType<Surreal['live']>> | null = null;
	let stopped = false;

	const stop = async () => {
		if (stopped) return;
		stopped = true;
		if (live) {
			try {
				await live.kill();
			} catch {
				// ignore live cleanup errors
			}
			live = null;
		}
		await db.close();
	};

	return produce(
		async ({ emit, lock }) => {
			const stopWithLock = () => {
				void stop();
				lock.set(false);
			};

			const emitEvent = (payload: QueueTaskStreamEvent): boolean => {
				const { error } = emit('job_queue', JSON.stringify(payload));
				if (error) {
					stopWithLock();
					return false;
				}
				return true;
			};

			let initialRows: Queue[] = [];
			try {
				initialRows = await queryMany<Queue>(
					db,
					'SELECT * FROM job_queue ORDER BY created_at DESC LIMIT $limit FETCH job.website;',
					{ limit: DEFAULT_LIMIT }
				);
			} catch {
				stopWithLock();
				return stop;
			}

			if (!emitEvent({ type: 'snapshot', tasks: initialRows.map(mapQueueTaskRow) })) {
				return stop;
			}

			try {
				live = await db.live(new Table('job_queue'));
			} catch {
				stopWithLock();
				return stop;
			}

			live.subscribe(async ({ action, recordId }) => {
				if (stopped) return;
				try {
					if (action === 'DELETE') {
						emitEvent({
							type: 'remove',
							id: toRouteId(normalizeRecordId(recordId)),
						});
						return;
					}

					const row = await queryOne<Queue>(
						db,
						'SELECT * FROM $id LIMIT 1 FETCH job.website;',
						{ id: recordId }
					);
					if (!row) {
						emitEvent({
							type: 'remove',
							id: toRouteId(recordId),
						});
						return;
					}

					emitEvent({
						type: 'upsert',
						task: mapQueueTaskRow(row),
					});
				} catch {
					stopWithLock();
					return;
				}
			});

			return stop;
		},
		{ ping: 15000, stop }
	);
};
