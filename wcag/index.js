const { chromium, devices } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const { RecordId, Surreal, Table } = require('surrealdb');

const url = process.argv[2];
const job_id = process.argv[3];
const deviceName = (process.env.WCAG_DEVICE_NAME || 'Desktop Chrome').trim();

if (!url || !url.length) throw new Error('Host parameter missing!');
if (!job_id || !job_id.length) throw new Error('Job ID parameter missing!');

const parseCsv = (input) => {
  if (!input || !input.length) return [];
  return input.split(',').map((item) => item.trim()).filter(Boolean);
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

(async () => {
  const browser = await chromium.launch({ headless: false });
  const descriptor = devices[deviceName];
  if (!descriptor) {
    await browser.close();
    throw new Error(`Invalid device name: ${deviceName}`);
  }

  const context = await browser.newContext({ ...descriptor });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'networkidle' });

  let builder = new AxeBuilder({ page });
  const runOnly = parseCsv(process.env.WCAG_RUN_ONLY || '');
  if (runOnly.length) {
    builder = builder.options({ runOnly: { type: 'tag', values: runOnly } });
  }

  const excludeRules = parseCsv(process.env.WCAG_EXCLUDE_RULES || '');
  if (excludeRules.length) {
    builder = builder.disableRules(excludeRules);
  }

  const raw = await builder.analyze();
  if (!isValidAxeResult(raw)) {
    await browser.close();
    throw new Error('Invalid or partial axe payload.');
  }

  const passes = raw.passes.length;
  const errors = raw.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').length;
  const warnings = raw.violations.length - errors;

  const pass_score = raw.passes.reduce((score, item) => scoreCalc(item.impact) + score, 0);
  const error_score = raw.violations.reduce((score, item) => scoreCalc(item.impact) + score, 0);
  const score = error_score === 0 ? 100 : Number((100 - (pass_score / (pass_score / error_score))).toFixed(2));

  const screenshot = await page.screenshot({ fullPage: true });
  const jobKey = job_id.split(':')[1];
  const screenshotName = `${jobKey}_${slugifyDevice(deviceName)}.png`;

  const result = {
    job: new RecordId('jobs', jobKey),
    device: deviceName,
    screenshot: screenshotName,
    score,
    passes,
    warnings,
    errors,
    raw
  };

  if (process.env.DEBUG == 'true') {
    console.debug(`WCAG results for ${job_id} on ${url} for ${deviceName}: ${JSON.stringify({...result, raw: "suppressed output"})}`);
  }

  try {
    const db = new Surreal();
    await db.connect(`${process.env.SURREAL_PROTOCOL === 'https' ? 'wss' : 'ws'}://${process.env.SURREAL_ADDRESS}`, {
      namespace: process.env.SURREAL_NAMESPACE,
      database: process.env.SURREAL_DATABASE,
      authentication: {
        username: process.env.SURREAL_USER,
        password: process.env.SURREAL_PASS
      }
    });

    const wcag_results = new Table('wcag_results');
    await db.create(wcag_results).content(result);
    await db.query(`f"screenshots:/${screenshotName}".put(b"${screenshot.toString('hex')}")`);
    await db.close();
  } catch (e) {
    throw `DB Error: ${e.message}`;
  }

  await browser.close();
})();
