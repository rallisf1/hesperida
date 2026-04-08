import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createUser, createWebsite, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';

const signup = async () => {
	const email = randomEmail('guard_user');
	const password = 'pass12345';
	const authClient = new ApiTestClient({ apiKey: null });
	const res = await authClient.call({
		method: 'POST',
		path: '/api/v1/auth/signup',
		body: { name: 'Guard User', email, password }
	});
	return { token: res.json?.data?.token as string, email, password };
};

const signinExisting = async (email: string, password: string): Promise<string> => {
	const client = new ApiTestClient({ apiKey: null });
	const res = await client.call({
		method: 'POST',
		path: '/api/v1/auth/signin',
		body: { email, password }
	});
	if (res.response.status !== 200) throw new Error(`Signin failed: ${res.response.status}`);
	return res.json.data.token as string;
};

const normalizeRecordId = (value: unknown): string => {
	if (typeof value === 'string') return value.replace(/^RecordId\((.+)\)$/i, '$1').replace(/^['"]|['"]$/g, '');
	if (value && typeof value === 'object') {
		const maybe = value as { tb?: unknown; id?: unknown };
		if (typeof maybe.tb === 'string' && typeof maybe.id !== 'undefined') {
			const raw = String(maybe.id).replace(/^['"]|['"]$/g, '');
			return raw.includes(':') ? raw : `${maybe.tb}:${raw}`;
		}
	}
	return String(value);
};
setDefaultTimeout(30_000);

describe('API Guard Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('protected routes require x-api-key', async () => {
		const { token } = await signup();
		const client = new ApiTestClient({ apiKey: null, bearerToken: token });
		const { response, json } = await client.call({ method: 'GET', path: '/api/v1/jobs' });

		expect(response.status).toBe(401);
		expect(json.ok).toBeFalse();
		expect(json.error.code).toBe('unauthorized');
		expect(json.error.message).toContain('x-api-key');
	});

	test('protected routes require valid user auth', async () => {
		const client = new ApiTestClient();
		const { response, json } = await client.call({ method: 'GET', path: '/api/v1/jobs' });

		expect(response.status).toBe(401);
		expect(json.ok).toBeFalse();
		expect(json.error.code).toBe('unauthorized');
		expect(json.error.message).toContain('Authentication required');
	});

	test('auth routes are exempt from x-api-key requirement', async () => {
		const client = new ApiTestClient({ apiKey: null });
		const email = randomEmail('auth_exempt');
		const { response, json } = await client.call({
			method: 'POST',
			path: '/api/v1/auth/signup',
			body: { name: 'Auth Exempt User', email, password: 'pass12345' }
		});

		expect(response.status).toBe(201);
		expect(json.ok).toBeTrue();
		expect(json.data.user.email).toBe(email);
	});

	test('protected route succeeds when both API key and bearer token are present', async () => {
		const { token } = await signup();
		const client = new ApiTestClient({ bearerToken: token });
		const listJobs = await client.call({ method: 'GET', path: '/api/v1/jobs' });
		expect(listJobs.response.status).toBe(200);
		expect(listJobs.json.ok).toBeTrue();
		expect(Array.isArray(listJobs.json.data.jobs)).toBeTrue();
	});

	test('viewer cannot create websites or jobs', async () => {
		const viewerEmail = randomEmail('viewer_guard');
		const viewerPassword = 'pass12345';
		const ownerEmail = randomEmail('owner_guard');
		const ownerPassword = 'pass12345';

		const viewer = await createUser({ name: 'Viewer Guard', email: viewerEmail, password: viewerPassword, role: 'viewer' });
		const owner = await createUser({ name: 'Owner Guard', email: ownerEmail, password: ownerPassword, role: 'editor' });
		if (!viewer || !owner) throw new Error('Failed to create guard users');

		const viewerToken = await signinExisting(viewerEmail, viewerPassword);
		const viewerClient = new ApiTestClient({ bearerToken: viewerToken });

		const websiteCreate = await viewerClient.call({
			method: 'POST',
			path: '/api/v1/websites',
			body: {
				url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
				description: 'viewer should fail'
			}
		});
		expect(websiteCreate.response.status).toBe(403);
		expect(websiteCreate.json.error.code).toBe('forbidden');

		const ownerWebsite = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'owner website'
		});
		if (!ownerWebsite) throw new Error('Failed to create owner website');

		await adminOne(
			'UPDATE websites SET users = array::distinct(array::append(users, type::record($viewerId))) WHERE id = type::record($id) RETURN AFTER;',
			{ id: normalizeRecordId(ownerWebsite.id), viewerId: normalizeRecordId(viewer.id) }
		);

		const jobCreate = await viewerClient.call({
			method: 'POST',
			path: '/api/v1/jobs',
			body: {
				website: normalizeRecordId(ownerWebsite.id),
				types: ['seo']
			}
		});
		expect(jobCreate.response.status).toBe(403);
		expect(jobCreate.json.error.code).toBe('forbidden');

	});
});
