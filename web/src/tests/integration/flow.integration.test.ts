import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';
import { normalizeRecordId, toRouteId } from '../helpers/ids';

setDefaultTimeout(30_000);

describe('API Ordered Flow Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('signup -> signin -> create website -> create job -> GET resources', async () => {
		const authClient = new ApiTestClient({ apiKey: null });
		const email = randomEmail('flow_user');
		const password = 'pass12345';

		// 1) signup
		const signup = await authClient.call({
			method: 'POST',
			path: '/api/v1/auth/signup',
			body: { name: 'Flow User', email, password }
		});
		expect(signup.response.status).toBe(201);
		expect(signup.json.ok).toBeTrue();

		// 2) signin (same user), continue with this session/token from now on
		const signinClient = new ApiTestClient({ apiKey: null });
		const signin = await signinClient.call({
			method: 'POST',
			path: '/api/v1/auth/signin',
			body: { email, password }
		});
		expect(signin.response.status).toBe(200);
		expect(signin.json.ok).toBeTrue();
		const token = signin.json.data.token as string;
		const client = new ApiTestClient({ bearerToken: token, cookies: {} });

		// 3) create website
		const createWebsite = await client.call({
			method: 'POST',
			path: '/api/v1/websites',
			body: {
				url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
				description: 'Flow website'
			}
		});
		expect(createWebsite.response.status).toBe(201);
		expect(createWebsite.json.ok).toBeTrue();
		const websiteId = normalizeRecordId(createWebsite.json.data.website.id);
		const websiteRouteId = toRouteId(createWebsite.json.data.website.id);

		// 4) create job
		const createJob = await client.call({
			method: 'POST',
			path: '/api/v1/jobs',
			body: {
				website: websiteId,
				types: ['probe', 'seo']
			}
		});
		expect(createJob.response.status).toBe(201);
		expect(createJob.json.ok).toBeTrue();
		const jobId = normalizeRecordId(createJob.json.data.job.id);
		const jobRouteId = toRouteId(createJob.json.data.job.id);

		// 5) GETs
		const me = await client.call({ method: 'GET', path: '/api/v1/auth/me' });
		expect(me.response.status).toBe(200);
		expect(me.json.ok).toBeTrue();
		expect(me.json.data.user.email).toBe(email);

		const websites = await client.call({ method: 'GET', path: '/api/v1/websites' });
		expect(websites.response.status).toBe(200);
		expect(websites.json.ok).toBeTrue();
		expect(Array.isArray(websites.json.data.websites)).toBeTrue();
		expect(websites.json.data.websites.length).toBe(1);

		const website = await client.call({ method: 'GET', path: `/api/v1/websites/${websiteRouteId}` });
		expect(website.response.status).toBe(200);
		expect(website.json.ok).toBeTrue();

		const jobs = await client.call({ method: 'GET', path: '/api/v1/jobs' });
		expect(jobs.response.status).toBe(200);
		expect(jobs.json.ok).toBeTrue();
		expect(Array.isArray(jobs.json.data.jobs)).toBeTrue();
		expect(jobs.json.data.jobs.length).toBe(1);

		const job = await client.call({ method: 'GET', path: `/api/v1/jobs/${jobRouteId}` });
		expect(job.response.status).toBe(200);
		expect(job.json.ok).toBeTrue();

		const queue = await client.call({ method: 'GET', path: '/api/v1/job-queue' });
		expect(queue.response.status).toBe(200);
		expect(queue.json.ok).toBeTrue();

		const resultsAgg = await client.call({ method: 'GET', path: `/api/v1/results/jobs/${jobId}` });
		expect(resultsAgg.response.status).toBe(200);
		expect(resultsAgg.json.ok).toBeTrue();
	});
});
