import { setInterval, clearInterval } from 'node:timers';
import {RecordId, Surreal, Table, eq} from 'surrealdb';
import Dockerode from 'dockerode';
import type { Job, Queue, Tool, Website } from './types';
import { slowTools, tools } from './constants';
import { readdir } from "node:fs/promises";
import { PassThrough } from 'node:stream';

const DEBUG = Bun.env.DEBUG == "true";
let RUNNERS = 0;
const NUMCORES = navigator.hardwareConcurrency;
const REBUILD = Bun.argv[2] == "--rebuild"
const ENV = [`SURREAL_USER=${Bun.env.SURREAL_USER}`, `SURREAL_PASS=${Bun.env.SURREAL_PASS}`, `SURREAL_NAMESPACE=${Bun.env.SURREAL_NAMESPACE}`, `SURREAL_DATABASE=${Bun.env.SURREAL_DATABASE}`, `SURREAL_ADDRESS=${Bun.env.SURREAL_ADDRESS}`, `SURREAL_PROTOCOL=${Bun.env.SURREAL_PROTOCOL}`, `DEBUG=${Bun.env.DEBUG}`];

console.log('Hesperida Orchestrator starting...');

const docker = new Dockerode({socketPath: '/var/run/docker.sock'});

if(DEBUG) console.debug(`Docker environment variables: ${JSON.stringify(ENV)}`);

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

const db = new Surreal();
await db.connect(`${Bun.env.SURREAL_PROTOCOL === 'https' ? 'wss': 'ws'}://${Bun.env.SURREAL_ADDRESS}`, {
	namespace: Bun.env.SURREAL_NAMESPACE,
	database: Bun.env.SURREAL_DATABASE,
	authentication: {
		username: Bun.env.SURREAL_USER!,
		password: Bun.env.SURREAL_PASS!
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

const runTask = async (task: Partial<Queue>, task_id: RecordId | null): Promise<boolean> => {
    if(DEBUG) console.debug(`Runner started for ${task_id} with data: ${JSON.stringify(task)}`);
    let isRetry = Object.hasOwn(task, 'status') && task.status === 'waiting';
    if(task_id) {
        await db.update<Queue>(task_id).merge({
            status: 'processing'
        });
    }
    if(slowTools.includes(task.type as Tool)) RUNNERS++;

    let runSuccessfully = false;
    const Env = task.options ? [...ENV, ...parseTaskOptions(task.options)] : ENV;
    try {
        const container = await docker.createContainer({
            Image: `hesperida-${task.type}`,
            Cmd: [task.target!, (task.job as RecordId).toString()],
            HostConfig: {
                NetworkMode: 'host',
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
        if(task_id) { // 1 retry then fail
            await db.update<Queue>(task_id).merge({
                status: isRetry ? 'failed' : 'waiting'
            });
        }
        if(DEBUG) console.error(`Task ${task_id} with type ${task.type} for ${task.job} failed.`);
    }
    if(slowTools.includes(task.type as Tool)) RUNNERS--;
    return runSuccessfully;
}

if(DEBUG) console.debug('Setting up deferred tasks checker...');

const waitingInterval = setInterval(async () => {
    if(RUNNERS < NUMCORES) {
        const [tasks] = await db.query(
            'SELECT * FROM job_queue WHERE status = $status ORDER BY created_at DESC LIMIT 1',
            { status: 'waiting' }
        ).collect<[Queue[]]>();
        if(tasks.length) await runTask(tasks[0], tasks[0].id);
    }
}, 1000 * 5); // every 5 seconds

if(DEBUG) console.debug('Listening for new Job Tasks...');

newTasks.subscribe(async ({action, value, recordId}) => {
    if(action == 'CREATE') {
        if(RUNNERS >= NUMCORES && slowTools.includes(value.type as Tool)) {
            if(DEBUG) console.warn(`Server resources (${NUMCORES}) reached before ${value.type} for ${recordId}. Adding to wait list.`);
            await db.update<Queue>(recordId).merge({
                status: 'waiting'
            });
        } else {
            await runTask(value, recordId);
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
        const website = await db.select<Website>(value.website as Job["website"]);
        const task: Queue = {
            job: recordId,
            type: 'probe',
            target: website?.url
        }
        const probeOptions = getToolTaskOptions(value.options, 'probe');
        if(probeOptions) task.options = probeOptions;
        const probeSuccess = await runTask(task, null);
        if(!probeSuccess) {
            await db.update<Job>(recordId).merge({
                status: 'failed'
            });
        } else {
            for (const tool of value.types as Tool[]) {
                if(tool === 'probe') continue;
                if(tool === 'whois') {
                    const [result] = await db.query(`SELECT array::flatten(
                            array::concat(
                                ipv4 ?? [],
                                ipv6 ?? []
                            )
                        ) AS ip
                        FROM probe_results
                        WHERE job = $job_id;`, { job_id:  recordId }).collect<[{ip:string[]}[]]>();
                    const IPs = result.length ? result[0]!.ip : [];
                    for (const IP of IPs) {
                        const task: Queue = {
                            job: recordId,
                            type: tool,
                            status: 'pending',
                            target: IP
                        }
                        const whoisOptions = getToolTaskOptions(value.options, 'whois');
                        if(whoisOptions) task.options = whoisOptions;
                        await db.create<Queue>(queue).content(task);
                    }
                } else {
                    const task: Queue = {
                        job: recordId,
                        type: tool,
                        status: 'pending',
                        target: website?.url
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
