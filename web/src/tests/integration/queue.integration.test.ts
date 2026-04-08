import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createJob, createQueueTask, createWebsite, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient } from '../helpers/request';
import { createAndSigninUser } from '../helpers/fixtures';
import { normalizeRecordId } from '../helpers/ids';
setDefaultTimeout(30_000);

describe('API Job Queue Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('list returns only owned queue tasks', async () => {
		const owner = await createAndSigninUser('Queue Owner A');
		const other = await createAndSigninUser('Queue Owner B');

		const ownerWebsite = await createWebsite({
			user: owner.userId,
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'Owner website'
		});
		const otherWebsite = await createWebsite({
			user: other.userId,
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'Other website'
		});
		if (!ownerWebsite || !otherWebsite) throw new Error('Failed to create websites');

		const ownerJob = await createJob({ website: normalizeRecordId(ownerWebsite.id), types: ['security'], status: 'processing' });
		const otherJob = await createJob({ website: normalizeRecordId(otherWebsite.id), types: ['security'], status: 'processing' });
		if (!ownerJob || !otherJob) throw new Error('Failed to create jobs');

		await createQueueTask({ job: normalizeRecordId(ownerJob.id), type: 'security', status: 'waiting' });
		await createQueueTask({ job: normalizeRecordId(otherJob.id), type: 'security', status: 'waiting' });

		const client = new ApiTestClient({ bearerToken: owner.token });
		const res = await client.call({ method: 'GET', path: '/api/v1/job-queue' });

		expect(res.response.status).toBe(200);
		expect(res.json.ok).toBeTrue();
		expect(Array.isArray(res.json.data.tasks)).toBeTrue();
		expect(res.json.data.tasks.length).toBe(1);
	});
});
