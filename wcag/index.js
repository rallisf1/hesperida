const { chromium, devices } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const { RecordId, Surreal, Table } = require('surrealdb');

const url = process.argv[2];
const job_id = process.argv[3];
const deviceName = (process.env.WCAG_DEVICE_NAME || 'Desktop Chrome').trim();

if (!url || !url.length) throw new Error('Host parameter missing!');
if (!job_id || !job_id.length) throw new Error('Job ID parameter missing!');

const startUrl = new URL(url).toString();
const jobKey = job_id.split(':')[1];
if (!jobKey) throw new Error(`Invalid job ID format: ${job_id}`);

const parseCsv = (input) => {
  if (!input || !input.length) return [];
  return input.split(',').map((item) => item.trim()).filter(Boolean);
};

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

const slugifyDevice = (name) =>
  name
    .toLowerCase()
    .replace(/\W+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const scoreCalc = (impact) => {
  switch (impact) {
    case 'critical':
      return 10;
    case 'serious':
      return 7;
    case 'moderate':
      return 3;
    default:
      return 1;
  }
};

const normalizeWebsiteUrl = (input, base) => {
  const parsed = base ? new URL(input, base) : new URL(input);
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

const isSameOriginPage = (candidate, root) => {
  try {
    const parsed = new URL(candidate);
    const rootUrl = new URL(root);
    if (parsed.origin !== rootUrl.origin) return false;
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (/\.(pdf|zip|rar|7z|png|jpe?g|gif|svg|webp|avif|mp4|mp3|mov|css|js|xml|json)$/i.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
};

const isValidAxeResult = (raw) => {
  if (!raw || typeof raw !== 'object') return false;
  if (!Array.isArray(raw.passes) || !Array.isArray(raw.violations) || !Array.isArray(raw.incomplete) || !Array.isArray(raw.inapplicable)) {
    return false;
  }
  for (const violation of raw.violations) {
    if (!violation || typeof violation !== 'object') return false;
    if (typeof violation.id !== 'string') return false;
    if (typeof violation.impact !== 'string' && violation.impact !== null) return false;
  }
  return true;
};

const scoreAxe = (raw) => {
  const passes = raw.passes.length;
  const errors = raw.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').length;
  const warnings = raw.violations.length - errors;
  const passScore = raw.passes.reduce((score, item) => scoreCalc(item.impact) + score, 0);
  const errorScore = raw.violations.reduce((score, item) => scoreCalc(item.impact) + score, 0);
  const score = errorScore === 0 ? 100 : Number((100 - (passScore / (passScore / errorScore))).toFixed(2));
  return { score, passes, warnings, errors };
};

const annotateRules = (rules, pageUrl, templateKey) =>
  rules.map((rule) => ({
    ...rule,
    pageUrl,
    templateKey,
    nodes: Array.isArray(rule.nodes)
      ? rule.nodes.map((node) => ({
          ...node,
          pageUrl,
          templateKey
        }))
      : []
  }));

const crawlOptions = parseJsonEnv('crawl') ?? {};
const urlOptions = parseJsonEnv('urls') ?? {};
const crawlEnabled = parseBoolean(crawlOptions.enabled, true);
const maxPages = parsePositiveInt(crawlOptions.maxPages ?? crawlOptions.max_pages, 12);
const maxDepth = parsePositiveInt(crawlOptions.maxDepth ?? crawlOptions.max_depth, 2);
const urlMode = typeof urlOptions.mode === 'string' ? urlOptions.mode : 'representative';
const includePatterns = Array.isArray(crawlOptions.include) ? crawlOptions.include.map(String).filter(Boolean) : [];
const excludePatterns = Array.isArray(crawlOptions.exclude) ? crawlOptions.exclude.map(String).filter(Boolean) : [];

const matchesAny = (value, patterns) => patterns.some((pattern) => {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return value.includes(pattern);
  }
});

const shouldKeepUrl = (candidate) => {
  if (!isSameOriginPage(candidate, startUrl)) return false;
  if (includePatterns.length && !matchesAny(candidate, includePatterns)) return false;
  if (excludePatterns.length && matchesAny(candidate, excludePatterns)) return false;
  return true;
};

async function loadSelectedUrls(db) {
  const [jobRows] = await db.query('SELECT website FROM jobs WHERE id = $job LIMIT 1;', {
    job: new RecordId('jobs', jobKey)
  }).collect();
  const website = jobRows?.[0]?.website;
  if (!website) return { website: null, urls: [] };

  const condition = urlMode === 'manual' ? 'manual = true' : 'selected = true OR manual = true';
  const [rows] = await db.query(
    `SELECT url, normalized_url, template_key FROM website_urls WHERE website = $website AND excluded = false AND (${condition}) ORDER BY manual DESC, selected DESC, url ASC;`,
    { website }
  ).collect();

  return {
    website,
    urls: (rows ?? [])
      .map((row) => String(row.normalized_url || row.url || '').trim())
      .filter(Boolean)
  };
}

async function upsertWebsiteUrl(db, website, candidate, source = 'wcag', extra = {}) {
  if (!website) return;
  try {
    const normalized = normalizeWebsiteUrl(candidate);
    const templateKey = extra.template_key || templateKeyForUrl(normalized);
    await db.query(
      `UPSERT website_urls CONTENT {
        website: $website,
        url: $url,
        normalized_url: $url,
        source: $source,
        selected: $selected,
        manual: false,
        excluded: false,
        template_key: $templateKey,
        template_label: $templateKey,
        last_seen_at: time::now()
      };`,
      { website, url: normalized, source, selected: extra.selected === true, templateKey }
    ).collect();
  } catch {
    // Ignore malformed URLs.
  }
}

(async () => {
  const db = new Surreal();
  await db.connect(`${process.env.SURREAL_PROTOCOL === 'https' ? 'wss' : 'ws'}://${process.env.SURREAL_ADDRESS}`, {
    namespace: process.env.SURREAL_NAMESPACE,
    database: process.env.SURREAL_DATABASE,
    authentication: {
      username: process.env.SURREAL_USER,
      password: process.env.SURREAL_PASS
    },
    reconnect: {
      enabled: true,
      attempts: 5,
      retryDelay: 1000
    }
  });

  const { website, urls: selectedUrls } = await loadSelectedUrls(db);
  const browser = await chromium.launch({ headless: false });
  const descriptor = devices[deviceName];
  if (!descriptor) {
    await browser.close();
    await db.close();
    throw new Error(`Invalid device name: ${deviceName}`);
  }

  const context = await browser.newContext({ ...descriptor });
  const page = await context.newPage();
  const discovered = new Map();

  const seedUrls = selectedUrls.length && (urlMode === 'selected' || urlMode === 'manual')
    ? selectedUrls
    : [startUrl];

  const queue = seedUrls.map((item) => ({ url: normalizeWebsiteUrl(item), depth: 0 }));
  const visited = new Set();

  while (queue.length && discovered.size < maxPages) {
    const next = queue.shift();
    if (!next || visited.has(next.url) || !shouldKeepUrl(next.url)) continue;
    visited.add(next.url);

    try {
      const response = await page.goto(next.url, { waitUntil: 'networkidle', timeout: parsePositiveInt(crawlOptions.timeout, 30000) });
      const finalUrl = normalizeWebsiteUrl(page.url());
      if (!shouldKeepUrl(finalUrl)) continue;

      const templateKey = templateKeyForUrl(finalUrl);
      const title = await page.title().catch(() => '');
      const fingerprint = await page.evaluate(() => {
        const landmarkCount = document.querySelectorAll('main,nav,header,footer,aside,section,article,form').length;
        const headings = [...document.querySelectorAll('h1,h2,h3')].map((el) => el.tagName.toLowerCase()).join(',');
        const forms = document.querySelectorAll('form').length;
        const bodyClasses = document.body?.className || '';
        return `${landmarkCount}|${headings}|forms:${forms}|${bodyClasses}`;
      }).catch(() => '');
      discovered.set(finalUrl, {
        url: finalUrl,
        depth: next.depth,
        status: response?.status() ?? null,
        title,
        template_key: `${templateKey}:${fingerprint}`.slice(0, 180),
        route_template: templateKey
      });
      await upsertWebsiteUrl(db, website, finalUrl, 'wcag', { template_key: templateKey });

      if (crawlEnabled && next.depth < maxDepth) {
        const hrefs = await page.$$eval('a[href]', (links) => links.map((link) => link.getAttribute('href')).filter(Boolean));
        for (const href of hrefs) {
          try {
            const normalized = normalizeWebsiteUrl(href, finalUrl);
            if (!visited.has(normalized) && shouldKeepUrl(normalized)) queue.push({ url: normalized, depth: next.depth + 1 });
          } catch {
            // Ignore invalid links.
          }
        }
      }
    } catch (error) {
      if (process.env.DEBUG === 'true') console.debug(`WCAG crawl skipped ${next.url}: ${error.message}`);
    }
  }

  if (!discovered.size) {
    const normalized = normalizeWebsiteUrl(startUrl);
    discovered.set(normalized, {
      url: normalized,
      depth: 0,
      status: null,
      title: '',
      template_key: templateKeyForUrl(normalized),
      route_template: templateKeyForUrl(normalized)
    });
  }

  const representatives = [];
  if (urlMode === 'selected' || urlMode === 'manual') {
    for (const item of discovered.values()) representatives.push(item);
  } else {
    const byTemplate = new Map();
    for (const item of discovered.values()) {
      const key = item.template_key || item.route_template;
      const existing = byTemplate.get(key);
      if (!existing || item.url.length < existing.url.length || item.url === startUrl) byTemplate.set(key, item);
    }
    representatives.push(...byTemplate.values());
  }

  const runOnly = parseCsv(process.env.WCAG_RUN_ONLY || '');
  const excludeRules = parseCsv(process.env.WCAG_EXCLUDE_RULES || '');
  const pages = [];
  const aggregateRaw = {
    passes: [],
    violations: [],
    incomplete: [],
    inapplicable: [],
    pages: [],
    crawl: {
      enabled: crawlEnabled,
      maxPages,
      maxDepth,
      discovered: [...discovered.values()],
      selected: representatives.map((item) => item.url),
      mode: urlMode
    }
  };

  let firstScreenshot = null;
  let firstScreenshotUrl = null;

  for (const target of representatives) {
    await page.goto(target.url, { waitUntil: 'networkidle', timeout: parsePositiveInt(crawlOptions.timeout, 30000) });

    let builder = new AxeBuilder({ page });
    if (runOnly.length) builder = builder.options({ runOnly: { type: 'tag', values: runOnly } });
    if (excludeRules.length) builder = builder.disableRules(excludeRules);

    const raw = await builder.analyze();
    if (!isValidAxeResult(raw)) throw new Error(`Invalid or partial axe payload for ${target.url}.`);

    const metrics = scoreAxe(raw);
    const pageResult = {
      url: target.url,
      title: target.title,
      template_key: target.template_key,
      route_template: target.route_template,
      ...metrics,
      raw
    };
    pages.push(pageResult);
    aggregateRaw.pages.push(pageResult);
    aggregateRaw.passes.push(...annotateRules(raw.passes, target.url, target.template_key));
    aggregateRaw.violations.push(...annotateRules(raw.violations, target.url, target.template_key));
    aggregateRaw.incomplete.push(...annotateRules(raw.incomplete, target.url, target.template_key));
    aggregateRaw.inapplicable.push(...annotateRules(raw.inapplicable, target.url, target.template_key));

    if (!firstScreenshot) {
      firstScreenshot = await page.screenshot({ fullPage: true });
      firstScreenshotUrl = target.url;
    }
  }

  const totals = pages.reduce(
    (acc, item) => {
      acc.score += item.score;
      acc.passes += item.passes;
      acc.warnings += item.warnings;
      acc.errors += item.errors;
      return acc;
    },
    { score: 0, passes: 0, warnings: 0, errors: 0 }
  );

  const screenshotName = `${jobKey}_${slugifyDevice(deviceName)}.png`;
  const result = {
    job: new RecordId('jobs', jobKey),
    device: deviceName,
    url: firstScreenshotUrl,
    screenshot: screenshotName,
    score: pages.length ? Number((totals.score / pages.length).toFixed(2)) : 0,
    passes: totals.passes,
    warnings: totals.warnings,
    errors: totals.errors,
    raw: aggregateRaw
  };

  if (process.env.DEBUG === 'true') {
    console.debug(`WCAG merged results for ${job_id} on ${pages.length} URLs for ${deviceName}: ${JSON.stringify({ ...result, raw: 'suppressed output' })}`);
  }

  const wcag_results = new Table('wcag_results');
  await db.create(wcag_results).content(result);
  if (firstScreenshot) await db.query(`f"screenshots:/${screenshotName}".put(b"${firstScreenshot.toString('hex')}")`);

  await browser.close();
  await db.close();
})();
