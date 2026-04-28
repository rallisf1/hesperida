import { toRegistrableDomain } from "rdapper";
import { RecordId, Surreal, Table, type Values} from 'surrealdb';
import { runEmailCheck } from '@wraps.dev/email-check';
import type { Mail } from './types'

const inputTarget = Bun.argv[2]
const job_id = Bun.argv[3]

if(!inputTarget) throw new Error(`Host parameter missing!`);
if(!job_id) throw new Error(`Job ID parameter missing!`);

const host = inputTarget.startsWith('http://') || inputTarget.startsWith('https://')
    ? new URL(inputTarget).hostname
    : inputTarget;

const domain = toRegistrableDomain(host);

if (!domain) throw new Error(`Could not parse domain!`);

const check = await runEmailCheck(domain, {
    quick: false,
    json: true,
    verbose: true,
    skipBlacklists: false,
    skipTls: false
});

const countEntriesByKey = (obj: unknown, targetKey: string): number => {
  if (obj === null || typeof obj !== "object") return 0;
  let total = 0;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === targetKey) {
      total += Array.isArray(value) ? value.length : 1;
    }
    total += countEntriesByKey(value, targetKey);
  }
  return total;
};


const errors = countEntriesByKey(check, "errors") + countEntriesByKey(check, "syntaxErrors");
const warnings = countEntriesByKey(check, "warnings");
const allCategories = new Set(['spf','dkim','dmarc','mx','blacklist','dnssec','ptr','domain-age']);
const badCategories = new Set(check.score.deductions.map(item => item.check));

const result: Values<Mail> = {
    job: new RecordId('jobs', job_id.split(':')[1]!),
    score: Math.max(100 - check.score.deductions.reduce((sum, item) => sum += item.points, 0),0),
    passes: allCategories.difference(badCategories).size,
    warnings,
    errors,
    raw: check,
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

    const mail_results = new Table('mail_results');

    await db.create<Mail>(mail_results).content(result);
    await db.close();
} catch (e) {
    throw `DB Error: ${(e as Error).message}`;
}
