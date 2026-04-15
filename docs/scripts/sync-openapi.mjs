import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve(process.cwd(), '../web/static/openapi.json');
const targetPath = resolve(process.cwd(), './openapi/openapi.json');

const fail = (message) => {
	console.error(`[sync-openapi] ${message}`);
	process.exit(1);
};

try {
	await access(sourcePath, constants.R_OK);
} catch {
	fail(`Source file not found or unreadable: ${sourcePath}`);
}

const sourceContent = await readFile(sourcePath, 'utf-8');
const spec = JSON.parse(sourceContent);

if (spec.components == null || typeof spec.components !== 'object') {
	spec.components = {};
}
if (spec.components.responses == null || typeof spec.components.responses !== 'object') {
	spec.components.responses = {};
}
if (
	spec.components.responses.GeneralError == null &&
	spec.components.responses.BadRequest != null
) {
	spec.components.responses.GeneralError = spec.components.responses.BadRequest;
}

const derivedTags = new Map();
for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
	if (!pathItem || typeof pathItem !== 'object') continue;
	for (const [method, operation] of Object.entries(pathItem)) {
		if (
			!['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'].includes(
				method.toLowerCase()
			)
		) {
			continue;
		}
		if (!operation || typeof operation !== 'object') continue;
		for (const tag of operation.tags ?? []) {
			if (typeof tag !== 'string' || !tag.trim()) continue;
			const normalized = tag.trim();
			if (!derivedTags.has(normalized)) {
				derivedTags.set(normalized, {
					name: normalized,
					description: `${normalized} endpoints`
				});
			}
		}
	}
}
if (derivedTags.size > 0) {
	const existingTags = Array.isArray(spec.tags) ? spec.tags : [];
	for (const tag of existingTags) {
		if (!tag || typeof tag.name !== 'string' || !tag.name.trim()) continue;
		const name = tag.name.trim();
		if (!derivedTags.has(name)) {
			derivedTags.set(name, { name, description: `${name} endpoints` });
		}
		const current = derivedTags.get(name);
		if (current && typeof tag.description === 'string' && tag.description.trim()) {
			current.description = tag.description;
		}
	}

	spec.tags = Array.from(derivedTags.values()).sort((a, b) => a.name.localeCompare(b.name));
}

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf-8');
console.log(`[sync-openapi] Synced ${sourcePath} -> ${targetPath}`);
