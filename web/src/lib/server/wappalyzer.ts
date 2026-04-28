import { Database } from "bun:sqlite";
import { config } from '$lib/server/config';

export interface Technology {
  name: string;
  description: string | null;
  website: string | null;
  icon: string | null;
}

const db = new Database(config.wappalyzerDB, { readonly: true });

export function techSearch(tech: string): Technology | null {

  const query = db.query(`
    SELECT * FROM technologies 
    WHERE LOWER(name) = LOWER($name) 
    LIMIT 1
  `);
  
  const result = query.get({ $name: tech }) as Technology | null;

  return result;
}