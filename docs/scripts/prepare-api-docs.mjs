import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve(process.cwd(), './docs/api/endpoints');

await rm(outputDir, { recursive: true, force: true });
console.log(`[prepare-api-docs] Cleaned ${outputDir}`);
