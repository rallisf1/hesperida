const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const {RecordId, Surreal, Table} = require('surrealdb');

const url = process.argv[2];
const job_id = process.argv[3];

if(!url || !url.length) throw new Error(`Host parameter missing!`);
if(!job_id || !job_id.length) throw new Error(`Job ID parameter missing!`);

const scoreCalc = (impact) => {
  switch(impact) {
    case "critical":
      return 10;
    case "serious":
      return 7;
    case "moderate":
      return 3;
    default: // minor
      return 1;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false }); 
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(url, {
      waitUntil: "networkidle",
  });

  const raw = await new AxeBuilder({ page }).analyze();
  // we disregard inapplicable and incomplete for the time being
  const passes = raw.passes.length;
  const errors = raw.violations.filter(v => v.impact === "serious" || v.impact === "critical").length;
  const warnings = raw.violations.length - errors;

  const pass_score = raw.passes.reduce((score, item) => scoreCalc(item.impact) + score, 0);
  const error_score = raw.violations.reduce((score, item) => scoreCalc(item.impact) + score, 0);

  const result = {
    job: new RecordId('jobs', job_id.split(':')[1]),
    score: Number((100 - (pass_score / (pass_score / error_score))).toFixed(2)), // percentage
    passes,
    warnings,
    errors,
    raw
  };

  if(process.env.DEBUG == "true") console.debug(`WCAG results for ${job_id} on ${url}: ${JSON.stringify(result)}`);

  const screenshot = await page.screenshot({fullPage: true});

  try {
    const db = new Surreal();

    await db.connect(`${process.env.SURREAL_PROTOCOL === 'https' ? 'wss': 'ws'}://${process.env.SURREAL_ADDRESS}`, {
      namespace: process.env.SURREAL_NAMESPACE,
      database: process.env.SURREAL_DATABASE,
      authentication: {
        username: process.env.SURREAL_USER,
        password: process.env.SURREAL_PASS
      }
    });
    
    const wcag_results = new Table('wcag_results');

    await db.create(wcag_results).content(result);

    await db.query(`f"screenshots:/${job_id.split(':')[1]}.png".put(b"${screenshot.toString('hex')}")`);

    await db.close();
  } catch (e) {
    throw `DB Error: ${e.message}`;
  }

  await browser.close();
})();