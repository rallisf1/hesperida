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

const connectUserDb = async (token: string): Promise<Surreal> => {
	const db = new Surreal();
	await db.connect(config.surrealWsUrl, {
		namespace: config.surrealNamespace,
		database: config.surrealDatabase,
	});
	await db.authenticate(token);
	return db;
};

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.authToken || !locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const db = await connectUserDb(locals.authToken);
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
			const emitEvent = (payload: QueueTaskStreamEvent): boolean => {
				const { error } = emit('job_queue', JSON.stringify(payload));
				if (error) {
					void stop();
					lock.set(false);
					return false;
				}
				return true;
			};

			const initialRows = await queryMany<Queue>(
				db,
				'SELECT * FROM job_queue ORDER BY created_at DESC LIMIT $limit FETCH job.website;',
				{ limit: DEFAULT_LIMIT }
			);

			if (!emitEvent({ type: 'snapshot', tasks: initialRows.map(mapQueueTaskRow) })) {
				return stop;
			}

			live = await db.live(new Table('job_queue'));

			live.subscribe(async ({ action, recordId }) => {
				if (stopped) return;

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
			});

			return stop;
		},
		{ ping: 15000, stop }
	);
};
