import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const specPath = resolve(process.cwd(), './openapi/openapi.json');

const fail = (message) => {
	console.error(`[validate-openapi] ${message}`);
	process.exit(1);
};

try {
	await access(specPath, constants.R_OK);
} catch {
	fail(`Spec file not found or unreadable: ${specPath}`);
}

const content = await readFile(specPath, 'utf-8');
const spec = JSON.parse(content);

const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

const hasBinaryContent = (contentObject) => {
	if (!contentObject || typeof contentObject !== 'object') return false;
	return Object.keys(contentObject).some(
		(mediaType) =>
			mediaType.startsWith('image/') ||
			mediaType.startsWith('audio/') ||
			mediaType.startsWith('video/') ||
			mediaType === 'application/octet-stream'
	);
};

const errors = [];
for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
	if (!pathItem || typeof pathItem !== 'object') continue;
	for (const [method, operation] of Object.entries(pathItem)) {
		if (!methods.has(method.toLowerCase())) continue;
		if (!operation || typeof operation !== 'object') continue;

		for (const [statusCode, response] of Object.entries(operation.responses ?? {})) {
			if (!/^2\d\d$/.test(statusCode)) continue;
			if (statusCode === '204') continue;
			if (!response || typeof response !== 'object') continue;

			if ('$ref' in response) continue;

			const contentObj = response.content;
			if (hasBinaryContent(contentObj)) continue;
			if (!contentObj || typeof contentObj !== 'object') {
				errors.push(`${method.toUpperCase()} ${pathKey} ${statusCode}: missing content schema`);
				continue;
			}
			const appJson = contentObj['application/json'];
			if (!appJson || typeof appJson !== 'object' || !appJson.schema) {
				errors.push(
					`${method.toUpperCase()} ${pathKey} ${statusCode}: missing application/json schema`
				);
			}
		}
	}
}

if (!Array.isArray(spec.tags) || spec.tags.length === 0) {
	errors.push('Top-level tags array is missing or empty.');
}

if (errors.length > 0) {
	console.error('[validate-openapi] Validation failed:');
	for (const err of errors) {
		console.error(`- ${err}`);
	}
	process.exit(1);
}

console.log(`[validate-openapi] OK: ${specPath}`);
