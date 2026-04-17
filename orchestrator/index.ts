import { setInterval, clearInterval } from 'node:timers';
import { DateTime, RecordId, Surreal, Table, eq } from 'surrealdb';
import Dockerode from 'dockerode';
import type { Job, Queue, Tool, Website } from './types';
import { slowTools, tools } from './constants';
import { readdir } from "node:fs/promises";
import { PassThrough } from 'node:stream';
import { hostname } from 'node:os';

const DEBUG = Bun.env.DEBUG == "true";
let RUNNERS = 0;
const NUMCORES = navigator.hardwareConcurrency;
const REBUILD = Bun.argv[2] == "--rebuild"
const configuredAttempts = Number.parseInt(Bun.env.MAX_ATTEMPTS ?? '4', 10);
const MAX_ATTEMPTS = Number.isFinite(configuredAttempts) ? Math.max(1, configuredAttempts) : 4;
const RETRY_BACKOFF_MS = [5_000, 15_000, 45_000];
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

process.on("beforeExit", async () => {
    console.log('Hesperida Orchestrator exiting gracefully...');
    clearInterval(waitingInterval);
    await newJobs.kill();
    await newTasks.kill();
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
