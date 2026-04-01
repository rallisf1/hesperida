import tls from "node:tls";
import {DateTime, RecordId, Surreal, Table, type Values} from 'surrealdb';
import type {SSL} from './types'

const url = Bun.argv[2]
const job_id = Bun.argv[3]

if(!url) throw new Error(`Host parameter missing!`);
if(!job_id) throw new Error(`Job ID parameter missing!`);

const host = new URL(url).hostname;

const joinIfNeeded = (item: string | string[] | undefined): string => {
  if(typeof item === "undefined") return "";
  if(Array.isArray(item)) return item.join(',');
  return item;
}

const socket = tls.connect(443, host, { servername: host }, async () => {
  const cert = socket.getPeerCertificate(true);
  const protocol = socket.getProtocol() || "";
  socket.end();
  
  const result: Values<SSL> = {
    job: new RecordId('jobs', job_id.split(':')[1]),
    valid_from: new DateTime(cert.valid_from),
    valid_to: new DateTime(cert.valid_to),
    protocol,
    owner: {
        domain: joinIfNeeded(cert.subject.CN),
        name: joinIfNeeded(cert.subject.O),
        country: joinIfNeeded(cert.subject.C),
        address: joinIfNeeded(cert.subject.ST)
    },
    issuer: {
        domain: joinIfNeeded(cert.issuer.CN),
        name: joinIfNeeded(cert.issuer.O),
        country: joinIfNeeded(cert.issuer.C)
    }
  };

  if(Bun.env.DEBUG == "true") console.debug(`SSL results for ${job_id} on ${host}: ${JSON.stringify(result)}`);

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
    
    const ssl_results = new Table('ssl_results');

    await db.create<SSL>(ssl_results).content(result);
    await db.close();
  } catch (e) {
    throw `DB Error: ${(e as Error).message}`;
  }
});
