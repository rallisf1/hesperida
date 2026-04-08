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

	test('queue list endpoints support pagination and validation', async () => {
		const owner = await createAndSigninUser('Queue Paged Owner');
		const website = await createWebsite({
			user: owner.userId,
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'Queue paged website'
		});
		if (!website) throw new Error('Failed to create website');

		const job = await createJob({
			website: normalizeRecordId(website.id),
			types: ['security'],
			status: 'processing'
		});
		if (!job) throw new Error('Failed to create job');

		for (let i = 0; i < 3; i += 1) {
			await createQueueTask({
				job: normalizeRecordId(job.id),
				type: 'security',
				status: 'waiting',
				target: `https://target-${i}.example.test`
			});
		}

		const client = new ApiTestClient({ bearerToken: owner.token });

		const queuePage = await client.call({ method: 'GET', path: '/api/v1/job-queue?page=1&page_size=2' });
		expect(queuePage.response.status).toBe(200);
		expect(queuePage.json.data.tasks.length).toBe(2);
		expect(queuePage.json.data.total_items).toBe(3);

		const byJobPage = await client.call({
			method: 'GET',
			path: `/api/v1/jobs/${encodeURIComponent(normalizeRecordId(job.id))}/queue?page=2&page_size=2`
		});
		expect(byJobPage.response.status).toBe(200);
		expect(byJobPage.json.data.tasks.length).toBe(1);
		expect(byJobPage.json.data.total_items).toBe(3);

		const badPartial = await client.call({
			method: 'GET',
			path: `/api/v1/jobs/${encodeURIComponent(normalizeRecordId(job.id))}/queue?page_size=2`
		});
		expect(badPartial.response.status).toBe(400);
		expect(badPartial.json.error.code).toBe('bad_request');
	});
});
