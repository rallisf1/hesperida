import { getDomainTld, lookup, toRegistrableDomain, type BootstrapData, type DomainRecord } from "rdapper";
import { readFile, writeFile, stat } from 'node:fs/promises';
import { restrictedTLDs } from './constants';
import { type Domain, type DomainRecords } from './types';
import {DateTime, RecordId, Surreal, Table, type Values} from 'surrealdb';
import { resolve4, resolve6, resolveTxt, resolveCname, resolveMx, resolveNs } from 'node:dns/promises';

const inputTarget = Bun.argv[2]
const job_id = Bun.argv[3]

if(!inputTarget) throw new Error(`Host parameter missing!`);
if(!job_id) throw new Error(`Job ID parameter missing!`);

const host = inputTarget.startsWith('http://') || inputTarget.startsWith('https://')
    ? new URL(inputTarget).hostname
    : inputTarget;

const domain = toRegistrableDomain(host);
const CACHE_FILE = '/rdap-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSIVE_SUBDOMAIN_LIMIT = 200;

const normalizeDnsValue = (value: string): string => value.toLowerCase().replace(/\.$/, '');

const getPassiveHosts = async (domain: string): Promise<string[]> => {
    try {
        const process = Bun.spawn({
            cmd: ['subfinder', '-silent', '-d', domain],
            stdout: 'pipe',
            stderr: 'pipe'
        });
        const exitCode = await process.exited;
        const stdout = await new Response(process.stdout).text();
        const stderr = await new Response(process.stderr).text();

        if(exitCode !== 0) {
            if(Bun.env.DEBUG == "true") console.debug(`subfinder failed for ${domain}: ${stderr.trim()}`);
            return [];
        }

        const lines = stdout.split('\n');
        const discovered = new Set<string>();
        for(const rawName of lines) {
            const normalized = normalizeDnsValue(rawName.replace(/^\*\./, '').trim());
            if(!normalized.length) continue;
            if(normalized === domain || normalized.endsWith(`.${domain}`)) {
                discovered.add(normalized);
                if(discovered.size >= PASSIVE_SUBDOMAIN_LIMIT) break;
            }
        }

        return [...discovered];
    } catch {
        return [];
    }
}

const getDnsRecords = async (domain: string, host: string, discoveredHosts: string[]) => {
    const safeResolve = async <T>(label: string, hostname: string, resolver: () => Promise<T>, fallback: T): Promise<T> => {
        try {
            return await resolver();
        } catch (error) {
            if(Bun.env.DEBUG == "true") {
                const err = error as Error & { code?: string };
                console.debug(`DNS ${label} lookup failed for ${hostname}: ${err.code ?? 'ERR'} ${err.message}`);
            }
            return fallback;
        }
    };

    const resolveTxtWithFallback = async (hostname: string): Promise<string[][]> => {

        const fromTxt = await safeResolve('TXT', hostname, () => resolveTxt(hostname), [] as string[][]);
        if(fromTxt.length) return fromTxt;

        const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=TXT`, {
            headers: { 'Accept': 'application/dns-json' }
        });
        const data = await response.json();
        //@ts-ignore
        return data.Answer?.filter(record => record.type === 16)?.map(record => [record.data.replace('"','')]) || [];

    };

    const hosts = [...new Set([domain, host, ...discoveredHosts].map((item) => item.toLowerCase()))];
    // add common records
    hosts.push(`dkim._domainkey.${domain}`, `_dmarc.${domain}`, `mail._domainkey.${domain}`);
    const a: Record<string, string[]> = {};
    const aaaa: Record<string, string[]> = {};
    const cname: Record<string, string[]> = {};
    const mx: Record<string, {exchange:string;priority:number}[]> = {};
    const txt: Record<string, string[]> = {};

    for (const hostname of hosts) {
        const [aRecords, aaaaRecords, cnameRecords, mxRecords, txtRecords] = await Promise.all([
            safeResolve('A', hostname, () => resolve4(hostname), [] as string[]),
            safeResolve('AAAA', hostname, () => resolve6(hostname), [] as string[]),
            safeResolve('CNAME', hostname, () => resolveCname(hostname), [] as string[]),
            safeResolve('MX', hostname, () => resolveMx(hostname), [] as {exchange:string;priority:number}[]),
            resolveTxtWithFallback(hostname)
        ]);

        a[hostname] = [...new Set(aRecords)];
        aaaa[hostname] = [...new Set(aaaaRecords)];
        cname[hostname] = [...new Set(cnameRecords.map(normalizeDnsValue))];
        mx[hostname] = [...new Map(mxRecords.map((v) => [`${v.priority}:${v.exchange.toLowerCase()}`, { priority: v.priority, exchange: v.exchange.toLowerCase() }])).values()];
        txt[hostname] = [...new Set(txtRecords.map((v) => v.join('')).filter(Boolean))];

        // cleanup
        if(!a[hostname].length) delete(a[hostname]);
        if(!aaaa[hostname].length) delete(aaaa[hostname]);
        if(!cname[hostname].length) delete(cname[hostname]);
        if(!mx[hostname].length) delete(mx[hostname]);
        if(!txt[hostname].length) delete(txt[hostname]);
    }

    const ns = await safeResolve('NS', domain, () => resolveNs(domain), [] as string[]);

    return {
        a,
        aaaa,
        cname,
        mx,
        txt,
        ns: [...new Set(ns.map(normalizeDnsValue))]
    };
}

async function getBootstrapData(): Promise<BootstrapData> {
    try {
        // Check if cache file exists and is fresh
        const stats = await stat(CACHE_FILE);
        const age = Date.now() - stats.mtimeMs;

        if (age < CACHE_TTL_MS) {
            const cached = await readFile(CACHE_FILE, 'utf-8');
            return JSON.parse(cached);
        }
    } catch {
        // Cache file doesn't exist or is unreadable, will fetch fresh
    }

    // Fetch fresh data
    const response = await fetch('https://data.iana.org/rdap/dns.json');
    if (!response.ok) {
        throw new Error(`Failed to load bootstrap data: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as BootstrapData;

    // Write to cache file
    await writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');

    return data;
}

const tld = getDomainTld(domain!);
let results: DomainRecord | undefined;
if(tld && !restrictedTLDs.includes(tld)) {
    // Use the cached bootstrap data in lookups
    const bootstrapData = await getBootstrapData();
    const { ok, record, error } = await lookup(domain!, {
        customBootstrapData: bootstrapData
    });
    if (!ok) throw new Error(error);
    results = record;
} else {
    if(Bun.env.DEBUG == "true") console.debug(`Domain lookup failed for ${domain}. ${tld && restrictedTLDs.includes(tld) ? `The ${tld} domain authority doesn't provide a whois/rdap server` : ''}`);
}

const discoveredHosts = await getPassiveHosts(domain!);
const dns = await getDnsRecords(domain!, host, discoveredHosts) as unknown as DomainRecords;

const result: Values<Domain> = {
    job: new RecordId('jobs', job_id.split(':')[1]!),
    domain: results?.domain ?? domain?.toUpperCase(),
    tld: results?.tld ?? tld,
    punycodeName: results?.punycodeName ?? null,
    unicodeName: results?.unicodeName ?? null,
    //isRegistered: results?.isRegistered ?? false,
    isIDN: results?.isIDN ?? false,
    registrar: {
        name: results?.registrar?.name ?? null,
        ianaId: results?.registrar?.ianaId ?? null,
        url: results?.registrar?.url ?? null,
        email: results?.registrar?.email ?? null,
        phone: results?.registrar?.phone ?? null
    },
    statuses: Array.isArray(results?.statuses) ? results?.statuses.map((s: {status:string}) => s.status.toLowerCase()) : [],
    transferLock: results?.transferLock ?? false,
    creationDate: results?.creationDate ? new DateTime(results?.creationDate): null,
    updatedDate: results?.updatedDate ? new DateTime(results?.updatedDate): null,
    expirationDate: results?.expirationDate ? new DateTime(results?.expirationDate): null,
    //deletionDate: results?.deletionDate ? new DateTime(results?.deletionDate): null,
    dnssecEnabled: results?.dnssec?.enabled ?? false,
    privacyEnabled: results?.privacyEnabled ?? false,
    nameservers: Array.isArray(results?.nameservers) ? [...new Set(results?.nameservers.map((ns: {host?:string}) => ns.host!.toLowerCase()).filter(Boolean))]: [],
    records: dns
};

if(Bun.env.DEBUG == "true") console.debug(`Domain results for ${job_id} on ${host}: ${JSON.stringify(result)}`);

try {
    const db = new Surreal();

    await db.connect(`${Bun.env.SURREAL_PROTOCOL}://${Bun.env.SURREAL_ADDRESS}/rpc`, {
        namespace: Bun.env.SURREAL_NAMESPACE,
        database: Bun.env.SURREAL_DATABASE,
        authentication: {
            username: Bun.env.SURREAL_USER!,
            password: Bun.env.SURREAL_PASS!
        }
    });

    const domain_results = new Table('domain_results');

    await db.create<Domain>(domain_results).content(result);
    await db.close();
} catch (e) {
    throw `DB Error: ${(e as Error).message}`;
}
