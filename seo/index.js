import { RecordId, Surreal, Table } from "surrealdb";
import { createAuditor } from '@seomator/seo-audit';

const url = process.argv[2];
const job_id = process.argv[3];

if (!url || !url.length) throw new Error('Host parameter missing!');
if (!job_id || !job_id.length) throw new Error('Job ID parameter missing!');

const url_check = new URL(url); // just to throw an error if it's not a url

const jobKey = job_id.split(':')[1];

const parseJsonEnv = (name) => {
    const raw = process.env[name];
    if (!raw || !raw.trim().length) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const parsePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
        if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
    }
    return fallback;
};

const normalizeWebsiteUrl = (input) => {
    const parsed = new URL(input);
    parsed.hash = '';
    const params = [...parsed.searchParams.entries()]
        .filter(([key]) => !/^utm_/i.test(key) && !['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase()))
        .sort(([a], [b]) => a.localeCompare(b));
    parsed.search = '';
    for (const [key, value] of params) parsed.searchParams.append(key, value);
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
};

const templateKeyForUrl = (input) => {
    const parsed = new URL(input);
    const parts = parsed.pathname
        .split('/')
        .filter(Boolean)
        .map((part) => {
            const decoded = decodeURIComponent(part).toLowerCase();
            if (/^\d+$/.test(decoded)) return ':id';
            if (/^[0-9a-f]{8,}$/i.test(decoded)) return ':hash';
            if (/^(page|p)-?\d+$/i.test(decoded)) return ':page';
            if (decoded.length > 40) return ':slug';
            return decoded.replace(/[0-9]+/g, ':n');
        });
    return `/${parts.join('/')}` || '/';
};

const crawlOptions = parseJsonEnv('crawl') ?? {};
const crawlEnabled = parseBoolean(crawlOptions.enabled ?? process.env.SEO_CRAWL_ENABLED, false);
const maxPages = parsePositiveInt(crawlOptions.maxPages ?? crawlOptions.max_pages ?? process.env.SEO_CRAWL_MAX_PAGES, 10);
const concurrency = parsePositiveInt(crawlOptions.concurrency ?? process.env.SEO_CRAWL_CONCURRENCY, 3);
const timeout = parsePositiveInt(crawlOptions.timeout ?? crawlOptions.timeoutMs ?? process.env.SEO_TIMEOUT, 30000);
const measureCwv = !parseBoolean(crawlOptions.noCwv ?? process.env.SEO_NO_CWV, false);
const crawledUrls = [];

const auditor = createAuditor({
    timeout,
    measureCwv,
    onPageComplete: (pageUrl) => {
        try {
            crawledUrls.push(normalizeWebsiteUrl(pageUrl));
        } catch {
            crawledUrls.push(pageUrl);
        }
    }
});

const raw = crawlEnabled
    ? await auditor.auditWithCrawl(url, maxPages, concurrency)
    : await auditor.audit(url);

const result = {
    job: new RecordId('jobs', jobKey),
    score: raw.overallScore,
    passes: raw.categoryResults.reduce((sum, cat) => sum += cat.passCount, 0),
    warnings: raw.categoryResults.reduce((sum, cat) => sum += cat.warnCount, 0),
    errors: raw.categoryResults.reduce((sum, cat) => sum += cat.failCount, 0),
    url,
    raw: {
        ...raw,
        crawl: {
            enabled: crawlEnabled,
            maxPages,
            concurrency,
            timeout,
            discoveredUrls: [...new Set(crawledUrls)],
            crawledPages: raw.crawledPages
        }
    }
}

if (process.env.DEBUG == 'true') {
    console.debug(`SEO results for ${job_id} on ${url}: ${JSON.stringify({...result, raw: "suppressed output"})}`);
}

const db = new Surreal();
try {
    await db.connect(`${process.env.SURREAL_PROTOCOL}://${process.env.SURREAL_ADDRESS}/rpc`, {
        namespace: process.env.SURREAL_NAMESPACE,
        database: process.env.SURREAL_DATABASE,
        authentication: {
            username: process.env.SURREAL_USER,
            password: process.env.SURREAL_PASS,
        },
    });

    const seoResults = new Table("seo_results");
    await db.create(seoResults).content(result);

    if (crawledUrls.length) {
        const [jobRows] = await db.query(
            'SELECT website FROM jobs WHERE id = $job LIMIT 1;',
            { job: new RecordId('jobs', jobKey) }
        ).collect();
        const website = jobRows?.[0]?.website;
        if (website) {
            for (const discovered of [...new Set(crawledUrls)]) {
                try {
                    const normalized = normalizeWebsiteUrl(discovered);
                    await db.query(
                        `UPSERT website_urls CONTENT {
                            website: $website,
                            url: $url,
                            normalized_url: $url,
                            source: 'seo',
                            selected: false,
                            manual: false,
                            excluded: false,
                            template_key: $templateKey,
                            template_label: $templateKey,
                            last_seen_at: time::now()
                        };`,
                        { website, url: normalized, templateKey: templateKeyForUrl(normalized) }
                    ).collect();
                } catch {
                    // Ignore malformed URLs emitted by the crawler.
                }
            }
        }
    }
} catch (e) {
    throw new Error(`DB Error: ${e.message}`);
} finally {
    await db.close();
}
