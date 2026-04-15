import { RecordId, Surreal, Table } from "surrealdb";
import { createAuditor } from './seomator/dist/index.js';

const url = process.argv[2];
const job_id = process.argv[3];

if (!url || !url.length) throw new Error('Host parameter missing!');
if (!job_id || !job_id.length) throw new Error('Job ID parameter missing!');

const url_check = new URL(url); // just to throw an error if it's not a url

const auditor = createAuditor();
const raw = await auditor.audit(url);
const jobKey = job_id.split(':')[1];

const result = {
    job: new RecordId('jobs', jobKey),
    score: raw.overallScore,
    passes: raw.categoryResults.reduce((sum, cat) => sum += cat.passCount, 0),
    warnings: raw.categoryResults.reduce((sum, cat) => sum += cat.warnCount, 0),
    errors: raw.categoryResults.reduce((sum, cat) => sum += cat.failCount, 0),
    raw
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
} catch (e) {
    throw new Error(`DB Error: ${e.message}`);
} finally {
    await db.close();
}