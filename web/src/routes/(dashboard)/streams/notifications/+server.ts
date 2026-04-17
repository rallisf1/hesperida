import type { RequestHandler } from './$types';
import { produce } from 'sveltekit-sse';
import { Surreal, Table } from 'surrealdb';
import { config } from '$lib/server/config';
import { queryMany, queryOne } from '$lib/server/db';
import { normalizeRecordId, toRouteId } from '$lib/server/record-id';
import type { Job, Queue, Website } from '$lib/types';
import type { DashboardNotificationEvent } from '$lib/notifications';

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
const isAuthError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error ?? '');
	const normalized = message.toLowerCase();
	return normalized.includes('session has expired') || normalized.includes('auth') || normalized.includes('not allowed');
};

const routeIdFrom = (value: unknown): string => toRouteId(normalizeRecordId(value));

const websiteUrlOfJob = (job: Job | (Job & { website?: Website })): string => {
	const website = job.website;
	if (website && typeof website === 'object' && 'url' in website) {
		return String((website as Website).url ?? '');
	}
	return '';
};

const buildJobEvent = (job: Job | (Job & { website?: Website })): DashboardNotificationEvent | null => {
	const status = String(job.status ?? '');
	if (status !== 'completed' && status !== 'failed') return null;

	const jobId = routeIdFrom(job.id);
	const websiteUrl = websiteUrlOfJob(job);
	const statusLabel = status === 'completed' ? 'completed' : 'failed';

	return {
		event_id: `job:${jobId}:${statusLabel}`,
		kind: 'job',
		status: statusLabel,
		job_id: jobId,
		website_url: websiteUrl || undefined,
		href: `/jobs/${jobId}`,
		message:
			status === 'completed'
				? `Job completed${websiteUrl ? ` for ${websiteUrl}` : ''}.`
				: `Job failed${websiteUrl ? ` for ${websiteUrl}` : ''}.`,
		created_at: new Date().toISOString()
	};
};

const buildTaskFailedEvent = (
	task: Queue | (Queue & { job?: Job | (Job & { website?: Website }) })
): DashboardNotificationEvent => {
	const taskId = routeIdFrom(task.id);
	const tool = String(task.type ?? '').trim().toLowerCase();
	const job = task.job;
	const jobId = job ? routeIdFrom((job as Job).id) : '';
	const websiteUrl =
		job && typeof job === 'object' && 'website' in job
			? websiteUrlOfJob(job as Job & { website?: Website })
			: '';

	return {
		event_id: `task:${taskId}:failed`,
		kind: 'task',
		status: 'failed',
		job_id: jobId,
		task_id: taskId,
		tool: tool || undefined,
		website_url: websiteUrl || undefined,
		href: `/job-queue/${taskId}`,
		message: `${tool ? `${tool.toUpperCase()} task` : 'Task'} failed${websiteUrl ? ` for ${websiteUrl}` : ''}.`,
		created_at: new Date().toISOString()
	};
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
	let jobsLive: Awaited<ReturnType<Surreal['live']>> | null = null;
	let queueLive: Awaited<ReturnType<Surreal['live']>> | null = null;
	let stopped = false;

	const previousJobStatuses = new Map<string, string>();
	const previousTaskStatuses = new Map<string, string>();
	const emittedEvents = new Set<string>();

	const stop = async () => {
		if (stopped) return;
		stopped = true;
		if (jobsLive) {
			try {
				await jobsLive.kill();
			} catch {
				// ignore live cleanup errors
			}
			jobsLive = null;
		}
		if (queueLive) {
			try {
				await queueLive.kill();
			} catch {
				// ignore live cleanup errors
			}
			queueLive = null;
		}
		await db.close();
	};

	return produce(
		async ({ emit, lock }) => {
			const stopWithLock = () => {
				void stop();
				lock.set(false);
			};

			const emitNotification = (payload: DashboardNotificationEvent): boolean => {
				if (emittedEvents.has(payload.event_id)) return true;
				emittedEvents.add(payload.event_id);
				const { error } = emit('notifications', JSON.stringify(payload));
				if (error) {
					stopWithLock();
					return false;
				}
				return true;
			};

			let initialJobs: { id: unknown; status: unknown }[] = [];
			try {
				initialJobs = await queryMany<{ id: unknown; status: unknown }>(
					db,
					'SELECT id, status FROM jobs;'
				);
			} catch {
				stopWithLock();
				return stop;
			}
			for (const row of initialJobs) {
				previousJobStatuses.set(routeIdFrom(row.id), String(row.status ?? ''));
			}

			let initialTasks: { id: unknown; status: unknown }[] = [];
			try {
				initialTasks = await queryMany<{ id: unknown; status: unknown }>(
					db,
					'SELECT id, status FROM job_queue;'
				);
			} catch {
				stopWithLock();
				return stop;
			}
			for (const row of initialTasks) {
				previousTaskStatuses.set(routeIdFrom(row.id), String(row.status ?? ''));
			}

			try {
				jobsLive = await db.live(new Table('jobs'));
			} catch {
				stopWithLock();
				return stop;
			}
			jobsLive.subscribe(async ({ action, recordId }) => {
				if (stopped) return;
				try {
					const id = routeIdFrom(recordId);
					if (action === 'DELETE') {
						previousJobStatuses.delete(id);
						return;
					}

					const job = await queryOne<Job & { website?: Website }>(
						db,
						'SELECT * FROM $id LIMIT 1 FETCH website;',
						{ id: recordId }
					);
					if (!job) {
						previousJobStatuses.delete(id);
						return;
					}

					const nextStatus = String(job.status ?? '');
					const previousStatus = previousJobStatuses.get(id);
					previousJobStatuses.set(id, nextStatus);
					if (!previousStatus || previousStatus === nextStatus) return;

					const payload = buildJobEvent(job);
					if (!payload) return;
					emitNotification(payload);
				} catch {
					stopWithLock();
				}
			});

			try {
				queueLive = await db.live(new Table('job_queue'));
			} catch {
				stopWithLock();
				return stop;
			}
			queueLive.subscribe(async ({ action, recordId }) => {
				if (stopped) return;
				try {
					const id = routeIdFrom(recordId);
					if (action === 'DELETE') {
						previousTaskStatuses.delete(id);
						return;
					}

					const task = await queryOne<Queue & { job?: Job & { website?: Website } }>(
						db,
						'SELECT * FROM $id LIMIT 1 FETCH job.website;',
						{ id: recordId }
					);
					if (!task) {
						previousTaskStatuses.delete(id);
						return;
					}

					const nextStatus = String(task.status ?? '');
					const previousStatus = previousTaskStatuses.get(id);
					previousTaskStatuses.set(id, nextStatus);
					if (!previousStatus || previousStatus === nextStatus) return;
					if (nextStatus !== 'failed') return;

					emitNotification(buildTaskFailedEvent(task));
				} catch {
					stopWithLock();
				}
			});

			return stop;
		},
		{ ping: 15000, stop }
	);
};
