import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createUser, ensureSchema, resetData, setWebsiteVerificationCode } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';
import { normalizeRecordId, toRouteId } from '../helpers/ids';
import { generateWebsiteVerificationCode } from '$lib/server/website-verification';

setDefaultTimeout(30_000);

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
		token: signin.json.data.token as string
	};
};

const setupSchedulableJob = async (token: string) => {
	const client = new ApiTestClient({ bearerToken: token });
	const website = await client.call({
		method: 'POST',
		path: '/api/v1/websites',
		body: {
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'Schedule target'
		}
	});
	expect(website.response.status).toBe(201);

	const websiteRecordId = normalizeRecordId(website.json.data.website.id);
	const code = generateWebsiteVerificationCode();
	const markVerified = await setWebsiteVerificationCode(websiteRecordId, code);
	expect(markVerified?.verified_at).toBeTruthy();

	const job = await client.call({
		method: 'POST',
		path: '/api/v1/jobs',
		body: {
			website: websiteRecordId,
			types: ['seo']
		}
	});
	expect(job.response.status).toBe(201);

	return {
		client,
		jobId: normalizeRecordId(job.json.data.job.id)
	};
};

describe('Schedule frequency guard integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('POST /api/v1/schedule rejects cron expressions more frequent than once per hour', async () => {
		const user = await registerUser('schedule_freq_post');
		const { client, jobId } = await setupSchedulableJob(user.token);

		const everyTenMinutes = await client.call({
			method: 'POST',
			path: '/api/v1/schedule',
			body: {
				job: jobId,
				cron: '*/10 * * * *'
			}
		});
		expect(everyTenMinutes.response.status).toBe(400);
		expect(everyTenMinutes.json.error.code).toBe('schedule_too_frequent');
		expect(String(everyTenMinutes.json.error.message)).toContain('Minimum interval is 60 minutes');

		const everyHour = await client.call({
			method: 'POST',
			path: '/api/v1/schedule',
			body: {
				job: jobId,
				cron: '0 * * * *'
			}
		});
		expect(everyHour.response.status).toBe(201);
		expect(everyHour.json.ok).toBeTrue();
	});

	test('PATCH /api/v1/schedule/:id rejects too-frequent cron but allows non-cron updates', async () => {
		const user = await registerUser('schedule_freq_patch');
		const { client, jobId } = await setupSchedulableJob(user.token);

		const createSchedule = await client.call({
			method: 'POST',
			path: '/api/v1/schedule',
			body: {
				job: jobId,
				cron: '0 * * * *'
			}
		});
		expect(createSchedule.response.status).toBe(201);
		const scheduleId = toRouteId(createSchedule.json.data.schedule.id);

		const enabledOnly = await client.call({
			method: 'PATCH',
			path: `/api/v1/schedule/${scheduleId}`,
			body: { enabled: false }
		});
		expect(enabledOnly.response.status).toBe(200);

		const tooFrequent = await client.call({
			method: 'PATCH',
			path: `/api/v1/schedule/${scheduleId}`,
			body: { cron: '0/30 * * * *' }
		});
		expect(tooFrequent.response.status).toBe(400);
		expect(tooFrequent.json.error.code).toBe('schedule_too_frequent');
		expect(String(tooFrequent.json.error.message)).toContain('Minimum interval is 60 minutes');

		const everyTwoHours = await client.call({
			method: 'PATCH',
			path: `/api/v1/schedule/${scheduleId}`,
			body: { cron: '0 */2 * * *' }
		});
		expect(everyTwoHours.response.status).toBe(200);
		expect(everyTwoHours.json.ok).toBeTrue();
	});
});
