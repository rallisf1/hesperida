import { setInterval, clearInterval } from 'node:timers';
import { DateTime, RecordId, Surreal, Table, eq } from 'surrealdb';
import Dockerode from 'dockerode';
import cron from 'node-cron';
import type {
	Job,
	Queue,
	Schedule,
	Tool,
	Website,
	WebsiteNotificationEvents
} from './types';
import { slowTools, tools } from './constants';
import { readdir } from "node:fs/promises";
import { PassThrough } from 'node:stream';
import { hostname } from 'node:os';
import { sendAppriseNotification } from '../notifications/apprise';

const DEBUG = Bun.env.DEBUG == "true";
let RUNNERS = 0;
const NUMCORES = navigator.hardwareConcurrency;
const REBUILD = Bun.argv[2] == "--rebuild"
const configuredAttempts = Number.parseInt(Bun.env.MAX_ATTEMPTS ?? '4', 10);
const MAX_ATTEMPTS = Number.isFinite(configuredAttempts) ? Math.max(1, configuredAttempts) : 4;
const RETRY_BACKOFF_MS = [5_000, 15_000, 45_000];
const APPRISE_URL = Bun.env.APPRISE_URL?.trim() ?? '';
const APPRISE_API_KEY = Bun.env.APPRISE_API_KEY?.trim() ?? '';
const DASHBOARD_URL = Bun.env.DASHBOARD_URL?.trim() ?? '';
const ENV = [`SURREAL_USER=${Bun.env.SURREAL_USER}`, `SURREAL_PASS=${Bun.env.SURREAL_PASS}`, `SURREAL_NAMESPACE=${Bun.env.SURREAL_NAMESPACE}`, `SURREAL_DATABASE=${Bun.env.SURREAL_DATABASE}`, `SURREAL_ADDRESS=${Bun.env.SURREAL_ADDRESS}`, `SURREAL_PROTOCOL=${Bun.env.SURREAL_PROTOCOL}`, `DEBUG=${Bun.env.DEBUG}`];

console.log('Hesperida Orchestrator starting...');

const docker = new Dockerode({socketPath: '/var/run/docker.sock'});

if (DEBUG) {
    console.debug(`Docker environment variables: ${JSON.stringify(ENV)}`);
}

for (const tool of tools) {
    let imageExists = false;
    try {
        await docker.getImage(`hesperida-${tool}`).inspect();
        imageExists = true;
        if(DEBUG) console.debug(`Docker image hesperida-${tool} found.`);
    } catch(err: any) {
        if(err.statusCode != 404) { // means we can't run docker commands
            throw err
        }
        if(DEBUG) console.debug(`Docker image hesperida-${tool} NOT found!`);
    }
    if (Bun.env.NODE_ENV === "development") {
        // check/rebuild tool images for development
        if(!imageExists || REBUILD) {
            console.log(`${REBUILD ? 'Re-': ''}Building image hesperida-${tool}...`);
            const files = await readdir(`/tools/${tool}`);
            const toolFiles = files.filter(f => f !== 'node_modules' && !f.startsWith('.')).map(f => `${tool}/${f}`);
            let stream = await docker.buildImage({
                context: '/tools',
                src: toolFiles
            },
            {
                t: `hesperida-${tool}`,
                dockerfile: `${tool}/Dockerfile`
            });
            await new Promise((resolve, reject) => {
                docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
            });
        }
    }
}

const resolveDockerNetwork = async (): Promise<string> => {
    const selfContainerId = hostname();
    try {
        const selfContainer = await docker.getContainer(selfContainerId).inspect();
        const networks = Object.keys(selfContainer.NetworkSettings?.Networks ?? {});
        if (networks.length) {
            const RESOLVED_DOCKER_NETWORK = networks[0]!;
            if (DEBUG) console.debug(`Auto-detected Docker network: ${RESOLVED_DOCKER_NETWORK}`);
            return RESOLVED_DOCKER_NETWORK;
        }
    } catch (error) {
        throw new Error('Failed to auto-detect orchestrator Docker network. Error: ' + (error as Error).message);
    }
    return ''; // makes ts happy
}
const DOCKER_NETWORK = await resolveDockerNetwork();

const db = new Surreal();
await db.connect(`${Bun.env.SURREAL_PROTOCOL === 'https' ? 'wss': 'ws'}://${Bun.env.SURREAL_ADDRESS}`, {
	namespace: Bun.env.SURREAL_NAMESPACE,
	database: Bun.env.SURREAL_DATABASE,
	authentication: {
		username: Bun.env.SURREAL_USER!,
		password: Bun.env.SURREAL_PASS!
	},
    reconnect: {
        enabled: true,
        attempts: 5,
        retryDelay: 1000
    }
});

const queue = new Table('job_queue');

const newJobs = await db.live(new Table('jobs')).fields('website','types','status','options').where(eq('status', 'pending'));
const newTasks = await db.live(queue).where(eq('status', 'pending'));
const scheduleLive = await db.live(new Table('schedule'));
const jobStatusLive = await db.live(new Table('jobs')).fields('status');

type JobStatus = Job['status'];
type NotificationLinkRow = {
	id?: RecordId<'website_notifications'>;
	website_url?: string;
	channel_url?: string;
	channel_id?: RecordId<'notification_channels'>;
	events?: Partial<WebsiteNotificationEvents> | null;
};

type JobNotificationPayload = {
	id?: RecordId<'jobs'>;
	status?: JobStatus;
	created_at?: DateTime | string;
	website?: { id?: RecordId<'websites'>; url?: string } | RecordId<'websites'>;
	seo?: { score?: number | null } | RecordId<'seo_results'> | null;
	stress?: { score?: number | null } | RecordId<'stress_results'> | null;
	security?: { score?: number | null } | RecordId<'security_results'> | null;
	wcag?: Array<{ score?: number | null } | RecordId<'wcag_results'>> | null;
};

const DEFAULT_NOTIFICATION_EVENTS: WebsiteNotificationEvents = {
	JOB_COMPLETED: false,
	JOB_FAILED: true,
	SEO_SCORE_BELOW: null,
	STRESS_SCORE_BELOW: null,
	WCAG_SCORE_BELOW: null,
	SECURITY_SCORE_BELOW: null,
	MAIL_SCORE_BELOW: null
};

const jobStatusById = new Map<string, JobStatus>();

const isAppriseConfigured = (): boolean => APPRISE_URL.length > 0;

const normalizeNotificationEvents = (
	value: Partial<WebsiteNotificationEvents> | null | undefined
): WebsiteNotificationEvents => ({
	JOB_COMPLETED: value?.JOB_COMPLETED === true,
	JOB_FAILED: value?.JOB_FAILED !== false,
	SEO_SCORE_BELOW:
		typeof value?.SEO_SCORE_BELOW === 'number' && Number.isFinite(value.SEO_SCORE_BELOW)
			? value.SEO_SCORE_BELOW
			: null,
	STRESS_SCORE_BELOW:
		typeof value?.STRESS_SCORE_BELOW === 'number' && Number.isFinite(value.STRESS_SCORE_BELOW)
			? value.STRESS_SCORE_BELOW
			: null,
	WCAG_SCORE_BELOW:
		typeof value?.WCAG_SCORE_BELOW === 'number' && Number.isFinite(value.WCAG_SCORE_BELOW)
			? value.WCAG_SCORE_BELOW
			: null,
	SECURITY_SCORE_BELOW:
		typeof value?.SECURITY_SCORE_BELOW === 'number' && Number.isFinite(value.SECURITY_SCORE_BELOW)
			? value.SECURITY_SCORE_BELOW
			: null,
	MAIL_SCORE_BELOW:
		typeof value?.MAIL_SCORE_BELOW === 'number' && Number.isFinite(value.MAIL_SCORE_BELOW)
			? value.MAIL_SCORE_BELOW
			: null
});

const toScore = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

const resolveWorstWcagScore = (wcag: JobNotificationPayload['wcag']): number | null => {
	if (!Array.isArray(wcag) || !wcag.length) return null;
	let min: number | null = null;
	for (const entry of wcag) {
		if (!entry || typeof entry !== 'object') continue;
		const score = toScore((entry as { score?: unknown }).score);
		if (score === null) continue;
		min = min === null ? score : Math.min(min, score);
	}
	return min;
};

const buildJobUrl = (jobId: string): string => `${DASHBOARD_URL}/jobs/${jobId}`;

const sendChannelNotification = async (channelUrl: string, title: string, body: string): Promise<void> => {
	await sendAppriseNotification(
		{
			baseUrl: APPRISE_URL,
			apiKey: APPRISE_API_KEY
		},
		{
			targets: [channelUrl],
			title,
			body,
			format: 'markdown'
		}
	);
};

const listWebsiteNotificationLinks = async (websiteId: RecordId<'websites'>): Promise<NotificationLinkRow[]> => {
	const [rows] = await db
		.query<[NotificationLinkRow[]]>(
			`SELECT id, events,
				website.url AS website_url,
				notification_channel.id AS channel_id,
				notification_channel.apprise_url AS channel_url
			 FROM website_notifications
			 WHERE website = $website;`,
			{ website: websiteId }
		)
		.collect();
	return rows ?? [];
};

const loadJobNotificationPayload = async (jobId: RecordId<'jobs'>): Promise<JobNotificationPayload | null> => {
	const [rows] = await db
		.query<[JobNotificationPayload[]]>(
			`SELECT id, status, created_at, website, seo, stress, security, wcag
			 FROM jobs
			 WHERE id = $id
			 LIMIT 1
			 FETCH website, seo, stress, security, wcag;`,
			{ id: jobId }
		)
		.collect();
	return rows?.[0] ?? null;
};

const sendCompletedNotifications = async (
	jobId: string,
	job: JobNotificationPayload,
	links: NotificationLinkRow[]
): Promise<void> => {
	const websiteUrl =
		typeof job.website === 'object' && job.website && 'url' in job.website
			? String(job.website.url ?? '')
			: '';
	const seoScore =
		job.seo && typeof job.seo === 'object' && !('tb' in job.seo)
			? toScore((job.seo as { score?: unknown }).score)
			: null;
	const stressScore =
		job.stress && typeof job.stress === 'object' && !('tb' in job.stress)
			? toScore((job.stress as { score?: unknown }).score)
			: null;
	const securityScore =
		job.security && typeof job.security === 'object' && !('tb' in job.security)
			? toScore((job.security as { score?: unknown }).score)
			: null;
	const wcagScore = resolveWorstWcagScore(job.wcag);

	for (const link of links) {
		const events = normalizeNotificationEvents(link.events);
		const triggered: string[] = [];
		if (events.JOB_COMPLETED) triggered.push('job completed');
		if (events.JOB_COMPLETED) {
			if (events.SEO_SCORE_BELOW !== null && seoScore !== null && seoScore < events.SEO_SCORE_BELOW) {
				triggered.push(`SEO score ${seoScore.toFixed(1)} < ${events.SEO_SCORE_BELOW}`);
			}
			if (
				events.STRESS_SCORE_BELOW !== null &&
				stressScore !== null &&
				stressScore < events.STRESS_SCORE_BELOW
			) {
				triggered.push(`Stress score ${stressScore.toFixed(1)} < ${events.STRESS_SCORE_BELOW}`);
			}
			if (events.WCAG_SCORE_BELOW !== null && wcagScore !== null && wcagScore < events.WCAG_SCORE_BELOW) {
				triggered.push(`WCAG score ${wcagScore.toFixed(1)} < ${events.WCAG_SCORE_BELOW}`);
			}
			if (
				events.SECURITY_SCORE_BELOW !== null &&
				securityScore !== null &&
				securityScore < events.SECURITY_SCORE_BELOW
			) {
				triggered.push(`Security score ${securityScore.toFixed(1)} < ${events.SECURITY_SCORE_BELOW}`);
			}
		}

		if (!triggered.length || !link.channel_url) continue;
		const title = `Hesperida: Job ${job.status}`;
		const body = [
			`Website: ${websiteUrl || link.website_url || 'Unknown website'}`,
			`Job: ${buildJobUrl(jobId)}`,
			`Triggered events:`,
			...triggered.map((line) => `- ${line}`)
		].join('\n');

		try {
			await sendChannelNotification(link.channel_url, title, body);
		} catch (error) {
			console.error(
				`Notification send failed for job ${jobId} (link ${link.id?.id.toString() ?? 'unknown'}):`,
				error
			);
		}
	}
};

const sendFailedNotifications = async (
	jobId: string,
	job: JobNotificationPayload,
	links: NotificationLinkRow[]
): Promise<void> => {
	const websiteUrl =
		typeof job.website === 'object' && job.website && 'url' in job.website
			? String(job.website.url ?? '')
			: '';
	for (const link of links) {
		const events = normalizeNotificationEvents(link.events);
		if (!events.JOB_FAILED || !link.channel_url) continue;
		try {
			await sendChannelNotification(
				link.channel_url,
				`Hesperida: Job ${jobId} failed`,
				[`Website: ${websiteUrl || link.website_url || 'Unknown website'}`, `Job: ${buildJobUrl(jobId)}`].join(
					'\n'
				)
			);
		} catch (error) {
			console.error(
				`Notification send failed for job ${jobId} (link ${link.id?.id.toString() ?? 'unknown'}):`,
				error
			);
		}
	}
};

const emitJobNotifications = async (jobId: RecordId<'jobs'>, status: JobStatus): Promise<void> => {
	if (!isAppriseConfigured()) return;
	if (status !== 'completed' && status !== 'failed') return;

	const job = await loadJobNotificationPayload(jobId);
	if (!job?.id || !job.website || typeof job.website !== 'object' || !('id' in job.website)) return;
	const websiteId = job.website.id as RecordId<'websites'>;
	const links = await listWebsiteNotificationLinks(websiteId);
	if (!links.length) return;

	const routeJobId = job.id.id.toString();
	if (status === 'completed') {
		await sendCompletedNotifications(routeJobId, job, links);
		return;
	}
	await sendFailedNotifications(routeJobId, job, links);
};

const bootstrapJobStatuses = async (): Promise<void> => {
	const [rows] = await db.query<[{ id?: RecordId<'jobs'>; status?: JobStatus }[]]>(
		'SELECT id, status FROM jobs;'
	).collect();
	for (const row of rows ?? []) {
		if (!row?.id || !row.status) continue;
		jobStatusById.set(row.id.id.toString(), row.status);
	}
};

const normalizeCronExpression = (value: string): string => value.trim().split(/\s+/).join(' ');

const scheduleTasks = new Map<string, ReturnType<typeof cron.schedule>>();

const stopScheduledTask = (scheduleId: string): void => {
	const task = scheduleTasks.get(scheduleId);
	if (!task) return;
	try {
		task.stop();
		task.destroy();
	} catch {
		// ignore scheduler cleanup errors
	}
	scheduleTasks.delete(scheduleId);
};

const disableSchedule = async (scheduleId: RecordId): Promise<void> => {
	const id = scheduleId.id.toString()
	if (!id.length) return;
	stopScheduledTask(id);
	try {
		await db.update<Schedule>(scheduleId).merge({
			enabled: false,
			updated_at: new DateTime(new Date().toISOString())
		});
	} catch (error) {
		console.error(`Failed to disable schedule ${id}:`, error);
	}
};

const appendScheduleRun = async (scheduleId: RecordId, jobId: RecordId): Promise<void> => {
	await db.query(
		'UPDATE $id SET created = array::slice(array::prepend(created ?? [], $job), 0, 365), updated_at = time::now();',
		{
			id: scheduleId,
			job: jobId
		}
	).collect();
};

const triggerSchedule = async (scheduleId: RecordId, sourceJobId: RecordId): Promise<void> => {
	const [rows] = await db
		.query<[{ id?: RecordId<'jobs'>; website?: RecordId<'websites'>; types?: Tool[]; options?: Record<string, unknown> }[]]>(
			'SELECT id, website, types, options FROM jobs WHERE id = $id LIMIT 1;',
			{ id: sourceJobId }
		)
		.collect();
	const source = rows?.[0];
	if (!source?.id || !source.website || !Array.isArray(source.types) || !source.types.length) {
		await disableSchedule(scheduleId);
		return;
	}

	const website = await db.select<Website>(source.website);
	if (!website?.id) {
		await disableSchedule(scheduleId);
		return;
	}

	const createdRows = await db
		.create<Job>(new Table('jobs'))
		.content({
			website: source.website,
			types: source.types,
			options: source.options ?? {},
			status: 'pending'
		});
	const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;
	if (!created?.id) return;

	await appendScheduleRun(scheduleId, created.id);
};

const reconcileSchedule = (schedule: Partial<Schedule> | null | undefined): void => {
	if (!schedule?.id) return;
    const scheduleId = schedule.id.id.toString();
	stopScheduledTask(scheduleId);

	if (!schedule.enabled) return;
	if (!schedule.job) return;

	const cronExpression = normalizeCronExpression(String(schedule.cron ?? ''));
	if (!cron.validate(cronExpression)) {
		void disableSchedule(schedule.id);
		return;
	}

	const task = cron.schedule(
		cronExpression,
		() => {
			void triggerSchedule(schedule.id!, schedule.job!);
		},
		{ timezone: 'UTC' }
	);
	scheduleTasks.set(scheduleId, task);
};

const bootstrapSchedules = async (): Promise<void> => {
	const [rows] = await db
		.query<[(Partial<Schedule>)[]]>('SELECT id, job, cron, enabled FROM schedule WHERE enabled = true;')
		.collect();
	for (const row of rows ?? []) {
		reconcileSchedule(row);
	}
};

await bootstrapSchedules();
await bootstrapJobStatuses();

process.on("beforeExit", async () => {
    console.log('Hesperida Orchestrator exiting gracefully...');
    clearInterval(waitingInterval);
    for (const scheduleId of scheduleTasks.keys()) {
        stopScheduledTask(scheduleId);
    }
    await newJobs.kill();
    await newTasks.kill();
    await scheduleLive.kill();
    await jobStatusLive.kill();
    await db.close();
});

const parseTaskOptions = (options: Record<string, unknown>): string[] => {
    const result: string[] = [];
    for (const [key, value] of Object.entries(options)) {
        if (typeof value === 'undefined') continue;
        if (value === null) {
            result.push(`${key}=`);
            continue;
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            result.push(`${key}=${value}`);
            continue;
        }
        result.push(`${key}=${JSON.stringify(value)}`);
    }
    return result;
}

const getToolTaskOptions = (jobOptions: unknown, tool: Tool): Record<string, unknown> | undefined => {
    if(!jobOptions || typeof jobOptions !== 'object' || Array.isArray(jobOptions)) return undefined;
    const optionsByTool = jobOptions as Record<string, unknown>;
    const toolOptions = optionsByTool[tool];
    if(!toolOptions || typeof toolOptions !== 'object' || Array.isArray(toolOptions)) return undefined;
    return toolOptions as Record<string, unknown>;
}

const getWcagDevices = (wcagOptions: Record<string, unknown> | undefined): string[] => {
    const DEFAULT_DEVICE = 'Desktop Chrome';
    if(!wcagOptions) return [DEFAULT_DEVICE];
    const devices = wcagOptions.devices;
    if(!Array.isArray(devices)) return [DEFAULT_DEVICE];

    const trueDevices = new Set<string>();
    for (const device of devices) {
        if(typeof device !== 'string') continue;
        const item = device.trim();
        if(!item.length) continue;
        trueDevices.add(item);
    }
    return trueDevices.size ? [...trueDevices] : [DEFAULT_DEVICE];
}

const getWcagTaskEnvOptions = (wcagOptions: Record<string, unknown> | undefined): Record<string, unknown> => {
    if(!wcagOptions) return {};
    const envOptions: Record<string, unknown> = {};

    const runOnly = wcagOptions.runOnly;
    if(Array.isArray(runOnly)) {
        envOptions.WCAG_RUN_ONLY = runOnly.map(v => String(v)).join(',');
    } else if(typeof runOnly === 'string' && runOnly.trim().length) {
        envOptions.WCAG_RUN_ONLY = runOnly.trim();
    }

    const excludeRules = wcagOptions.excludeRules;
    if(Array.isArray(excludeRules)) {
        envOptions.WCAG_EXCLUDE_RULES = excludeRules.map(v => String(v)).join(',');
    } else if(typeof excludeRules === 'string' && excludeRules.trim().length) {
        envOptions.WCAG_EXCLUDE_RULES = excludeRules.trim();
    }

    return envOptions;
}

const getRetryBackoffMs = (attemptNumber: number): number => {
    const index = Math.max(0, Math.min(RETRY_BACKOFF_MS.length - 1, attemptNumber - 1));
    return RETRY_BACKOFF_MS[index]!;
}

const runTask = async (task: Partial<Queue>, task_id: RecordId | null, task_url: string): Promise<boolean> => {
    if(DEBUG) console.debug(`Runner started for ${task_id} with data: ${JSON.stringify(task)}`);
    let attemptNumber = task.attempts ?? 0;
    if(task_id) {
        attemptNumber += 1;
        await db.update<Queue>(task_id).merge({
            status: 'processing',
            attempts: attemptNumber
        });
    }
    if(slowTools.includes(task.type as Tool)) RUNNERS++;

    let runSuccessfully = false;

    const Env = task.options ? [...ENV, ...parseTaskOptions(task.options)] : ENV;
    let executionTarget = task.target ?? task_url;
    if(task.type === 'wcag') {
        Env.push(`WCAG_DEVICE_NAME=${task.target}`);
        executionTarget = task_url;
    }

    try {
        const container = await docker.createContainer({
            Image: `hesperida-${task.type}`,
            Cmd: [executionTarget, task.job!.toString()],
            HostConfig: {
                NetworkMode: DOCKER_NETWORK,
                IpcMode: task.type === 'wcag' ? 'host' : 'private'
            },
            Env
        });

        const logStream = new PassThrough();
        logStream.on('data', (chunk) => {
            const lines = chunk.toString().trim().split('\n');
            for (const line of lines) {
                if (line) console.log(`  ${task.type} | ${line}`);
            }
        });

        const stream = await container.attach({
            stream: true,
            stdout: true,
            stderr: true
        });

        container.modem.demuxStream(stream, logStream, logStream);

        await container.start();

        const data = await container.wait();
        if(data.StatusCode === 0) runSuccessfully = true;

        await container.remove();

    } catch(e) {
        console.error(`Running container hesperida-${task.type} failed!`, e);
    }

    if(!runSuccessfully) {
        if(task_id) {
            if(attemptNumber >= MAX_ATTEMPTS) {
                await db.update<Queue>(task_id).merge({
                    status: 'failed'
                });
                await db.update<Job>(task.job as RecordId).merge({
                    status: 'failed'
                });
            } else {
                const nextRunAt = new Date(Date.now() + getRetryBackoffMs(attemptNumber));
                await db.update<Queue>(task_id).merge({
                    status: 'waiting',
                    next_run_at: new DateTime(nextRunAt.toISOString())
                });
            }
        }
        if(DEBUG) console.error(`Task ${task_id} with type ${task.type} for ${task.job} failed.`);
    }
    if(slowTools.includes(task.type as Tool)) RUNNERS--;
    return runSuccessfully;
}

if(DEBUG) console.debug('Setting up deferred tasks checker...');

const waitingInterval = setInterval(async () => {
    if(RUNNERS < NUMCORES) {
        const [tasks] = await db.query<[(Queue & { job: { id: RecordId, website: { url: string } } })[]]>(
            'SELECT *, job.id, job.website.url FROM job_queue WHERE status = $status AND next_run_at <= time::now() ORDER BY next_run_at ASC LIMIT 1',
            { status: 'waiting' }
        ).collect();
        if(tasks.length) {
            await runTask({ ...tasks[0]!, job: tasks[0]?.job.id as RecordId<"jobs"> }, tasks[0]?.id!, tasks[0]?.job.website.url!);
        }
    }
}, 1000 * 5); // every 5 seconds

if(DEBUG) console.debug('Listening for new Job Tasks...');

newTasks.subscribe(async ({action, value, recordId}) => {
    if(action == 'CREATE') {
        if(RUNNERS >= NUMCORES && slowTools.includes(value.type as Tool)) {
            if(DEBUG) console.warn(`Server resources (${NUMCORES}) reached before ${value.type} for ${recordId}. Adding to wait list.`);
            await db.update<Queue>(recordId).merge({
                status: 'waiting',
                next_run_at: new DateTime(new Date().toISOString())
            });
        } else {
            const [result] = await db.query<{ website: Website }[][]>('SELECT website.* FROM jobs WHERE id = $id', { id: value.job }).collect();
            await runTask(value, recordId, result![0]!.website.url);
        }
    } else {
        console.warn(`${action} triggered for status ${value.status} on ${recordId}. This shouldn't happen!`);
    }
});

if(DEBUG) console.debug('Listening for schedules...');
scheduleLive.subscribe(({ action, value, recordId }) => {
	if (action === 'DELETE') {
		stopScheduledTask(recordId.id.toString());
		return;
	}

	reconcileSchedule({
		...(value as Partial<Schedule>),
		id: recordId as RecordId<'schedule'>
	});
});

if(DEBUG) console.debug('Listening for job status transitions...');
jobStatusLive.subscribe(({ action, value, recordId }) => {
	const jobId = recordId.id.toString();
	if (!jobId.length) return;
	if (action === 'DELETE') {
		jobStatusById.delete(jobId);
		return;
	}

	const nextStatus = (value?.status as JobStatus | undefined) ?? undefined;
	if (!nextStatus) return;
	const previousStatus = jobStatusById.get(jobId);
	jobStatusById.set(jobId, nextStatus);
	if (previousStatus === nextStatus) return;
	if (nextStatus !== 'completed' && nextStatus !== 'failed') return;

	void emitJobNotifications(recordId as RecordId<'jobs'>, nextStatus);
});

if(DEBUG) console.debug('Listening for new Jobs...');
console.log('Hesperida Orchestrator ready! 🚀🚀🚀');

newJobs.subscribe(async ({action, value, recordId}) => {
    if(action == 'CREATE') {
        await db.update<Job>(recordId).merge({
            status: 'processing'
        });
        const website = await db.select<Website>(value.website as RecordId);
        const task: Partial<Queue> = {
            job: recordId as RecordId<"jobs">,
            type: 'probe'
        }
        const probeOptions = getToolTaskOptions(value.options, 'probe');
        if(probeOptions) task.options = probeOptions;
        const probeSuccess = await runTask(task, null, website!.url);
        if(!probeSuccess) {
            await db.update<Job>(recordId).merge({
                status: 'failed'
            });
        } else {
            for (const tool of value.types as Tool[]) {
                if(tool === 'probe') continue;
                if(tool === 'whois') {
                    const [result] = await db.query<[{ip:string[]}[]]>(`SELECT array::flatten(
                            array::concat(
                                ipv4 ?? [],
                                ipv6 ?? []
                            )
                        ) AS ip
                        FROM probe_results
                        WHERE job = $job_id;`, { job_id:  recordId }).collect();
                    const IPs = result.length ? result[0]!.ip : [];
                    if(!IPs.length) {
                        // No IPs to resolve; mark as empty array so job completion logic can finish.
                        await db.update<Job>(recordId).merge({
                            whois: []
                        });
                        continue;
                    }
                    for (const IP of IPs) {
                        const task: Partial<Queue> = {
                            job: recordId as RecordId<"jobs">,
                            type: tool,
                            status: 'pending',
                            target: IP,
                            attempts: 0
                        }
                        const whoisOptions = getToolTaskOptions(value.options, 'whois');
                        if(whoisOptions) task.options = whoisOptions;
                        await db.create<Queue>(queue).content(task);
                    }
                } else if(tool === 'wcag') {
                    const wcagOptions = getToolTaskOptions(value.options, 'wcag');
                    const devices = getWcagDevices(wcagOptions);
                    const wcagEnvOptions = getWcagTaskEnvOptions(wcagOptions);
                    for (const device of devices) {
                        const task: Partial<Queue> = {
                            job: recordId as RecordId<"jobs">,
                            type: tool,
                            status: 'pending',
                            target: device,
                            attempts: 0,
                            options: {
                                ...wcagEnvOptions
                            }
                        }
                        await db.create<Queue>(queue).content(task);
                    }
                } else {
                    const task: Partial<Queue> = {
                        job: recordId as RecordId<"jobs">,
                        type: tool,
                        status: 'pending',
                        attempts: 0
                    }
                    const toolOptions = getToolTaskOptions(value.options, tool);
                    if(toolOptions) task.options = toolOptions;
                    await db.create<Queue>(queue).content(task);
                }
            }
        }
    } else {
        console.warn(`${action} triggered for status ${value.status} on ${recordId}. This shouldn't happen!`);
    }
});
