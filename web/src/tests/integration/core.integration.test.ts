import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createUser, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';
setDefaultTimeout(30_000);

const normalizeRecordId = (value: unknown): string => {
	const normalizeString = (input: string): string => {
		const trimmed = input.trim();
		const unquoted = trimmed.replace(/^['"]+|['"]+$/g, '');
		const recordIdWrapped = unquoted.match(/^RecordId\((.+)\)$/);
		const wrappedRaw = recordIdWrapped ? recordIdWrapped[1] : unquoted;
		const raw = wrappedRaw.replace(/^['"]+|['"]+$/g, '');
		return raw.replace(/^([a-z_]+):\1:/i, '$1:');
	};

	if (typeof value === 'string') return normalizeString(value);
	if (typeof value === 'number' || typeof value === 'bigint') return String(value);
	if (value && typeof value === 'object') {
		const maybe = value as { tb?: unknown; id?: unknown };
		if (typeof maybe.tb === 'string' && typeof maybe.id !== 'undefined') {
			const idValue = normalizeString(String(maybe.id));
			return idValue.includes(':') ? idValue : `${maybe.tb}:${idValue}`;
		}
		if ('toString' in value && typeof (value as { toString: () => string }).toString === 'function') {
			const text = (value as { toString: () => string }).toString();
			if (text && text !== '[object Object]') return normalizeString(text);
		}
	}
	throw new Error(`Unexpected record id shape: ${JSON.stringify(value)} (${String(value)})`);
};

const toRouteId = (value: unknown): string => {
	const normalized = normalizeRecordId(value);
	const parts = normalized.split(':');
	return parts.length > 1 ? parts.slice(1).join(':') : normalized;
};

const registerUser = async (namePrefix: string) => {
	const email = randomEmail(namePrefix);
	const password = 'pass12345';
	const created = await createUser({ name: `${namePrefix} User`, email, password });
	if (!created) throw new Error('createUser failed in test setup');

	const client = new ApiTestClient({ apiKey: null });
	const signin = await client.call({
		method: 'POST',
		path: '/api/v1/auth/signin',
		body: { email, password }
	});
	if (signin.response.status !== 200) throw new Error('Signin failed in test setup');

	return {
		email,
		token: signin.json.data.token as string
	};
};

describe('API Core CRUD/Results Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('websites create/list are owner-scoped and cross-tenant reads return 404', async () => {
		const userA = await registerUser('core_a');
		const userB = await registerUser('core_b');

		const clientA = new ApiTestClient({ bearerToken: userA.token });
		const clientB = new ApiTestClient({ bearerToken: userB.token });

		const created = await clientA.call({
			method: 'POST',
			path: '/api/v1/websites',
			body: {
				url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
				description: 'Owner A website'
			}
		});

		expect(created.response.status).toBe(201);
		const websiteId = toRouteId(created.json.data.website.id);

		const listA = await clientA.call({ method: 'GET', path: '/api/v1/websites' });
		expect(listA.response.status).toBe(200);
		expect(listA.json.data.websites.length).toBe(1);

		const listB = await clientB.call({ method: 'GET', path: '/api/v1/websites' });
		expect(listB.response.status).toBe(200);
		expect(listB.json.data.websites.length).toBe(0);

		const notOwnedGet = await clientB.call({ method: 'GET', path: `/api/v1/websites/${websiteId}` });
		expect(notOwnedGet.response.status).toBe(404);
		expect(notOwnedGet.json.error.code).toBe('not_found');
	});

	test('jobs create persists tools/options and rejects invalid payload', async () => {
		const user = await registerUser('core_jobs');
		const client = new ApiTestClient({ bearerToken: user.token });

		const websiteRes = await client.call({
			method: 'POST',
			path: '/api/v1/websites',
			body: {
				url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
				description: 'Jobs target'
			}
		});
		expect(websiteRes.response.status).toBe(201);

		const websiteId = toRouteId(websiteRes.json.data.website.id);
		const websiteRecordId = normalizeRecordId(websiteRes.json.data.website.id);
		const jobRes = await client.call({
			method: 'POST',
			path: '/api/v1/jobs',
			body: {
				website: websiteRecordId,
				types: ['seo', 'wcag'],
				options: { wcag: { devices: ['Desktop Chrome'] } }
			}
		});

		expect(jobRes.response.status).toBe(201);
		expect(jobRes.json.data.job.types).toEqual(['seo', 'wcag']);
		expect(jobRes.json.data.job.options.wcag.devices).toEqual(['Desktop Chrome']);

		const persisted = await adminOne<{ options: { wcag?: { devices?: string[] } } }>(
			'SELECT options FROM jobs WHERE id = type::record($id) LIMIT 1;',
			{ id: jobRes.json.data.job.id }
		);
		expect(persisted?.options?.wcag?.devices).toEqual(['Desktop Chrome']);

		const invalid = await client.call({
			method: 'POST',
			path: '/api/v1/jobs',
			body: {
				website: websiteId,
				types: ['invalid-tool']
			}
		});

		expect(invalid.response.status).toBe(400);
		expect(invalid.json.error.code).toBe('bad_request');
	});

	test('results endpoints only return user-owned job data', async () => {
		const userA = await registerUser('core_results_a');
		const userB = await registerUser('core_results_b');

		const clientA = new ApiTestClient({ bearerToken: userA.token });
		const clientB = new ApiTestClient({ bearerToken: userB.token });

		const website = await clientA.call({
			method: 'POST',
			path: '/api/v1/websites',
			body: {
				url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
				description: 'Results website'
			}
		});
		expect(website.response.status).toBe(201);

		const job = await clientA.call({
			method: 'POST',
			path: '/api/v1/jobs',
			body: {
				website: normalizeRecordId(website.json.data.website.id),
				types: ['seo']
			}
		});
		expect(job.response.status).toBe(201);

		const jobId = normalizeRecordId(job.json.data.job.id);

		const ownerAgg = await clientA.call({ method: 'GET', path: `/api/v1/results/jobs/${jobId}` });
		expect(ownerAgg.response.status).toBe(200);
		expect(ownerAgg.json.ok).toBeTrue();

		const ownerTool = await clientA.call({ method: 'GET', path: `/api/v1/results/jobs/${jobId}/seo` });
		expect(ownerTool.response.status).toBe(200);
		expect(ownerTool.json.data.tool).toBe('seo');

		const otherAgg = await clientB.call({ method: 'GET', path: `/api/v1/results/jobs/${jobId}` });
		expect(otherAgg.response.status).toBe(404);
		expect(otherAgg.json.error.code).toBe('not_found');

		const otherTool = await clientB.call({ method: 'GET', path: `/api/v1/results/jobs/${jobId}/seo` });
		expect(otherTool.response.status).toBe(404);
		expect(otherTool.json.error.code).toBe('not_found');
	});
});
