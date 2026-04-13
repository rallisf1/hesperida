import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createUser, ensureSchema, resetData } from '../helpers/db';
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

		const ownedGet = await clientA.call({ method: 'GET', path: `/api/v1/websites/${websiteId}` });
		expect(ownedGet.response.status).toBe(200);
		expect(ownedGet.json.data.website).toBeTruthy();
		expect(ownedGet.json.data.owner_user).toBeUndefined();
		expect(ownedGet.json.data.member_users).toBeUndefined();

		const members = await clientA.call({ method: 'GET', path: `/api/v1/websites/${websiteId}/members` });
		expect(members.response.status).toBe(200);
		expect(members.json.data.owner_user).toBeTruthy();
		expect(Array.isArray(members.json.data.member_users)).toBeTrue();
		expect(members.json.data.member_users.length).toBe(1);

		const notOwnedMembers = await clientB.call({
			method: 'GET',
			path: `/api/v1/websites/${websiteId}/members`
		});
		expect(notOwnedMembers.response.status).toBe(404);
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
		const code = generateWebsiteVerificationCode();
		const markVerified = await adminOne<{ verified_at: unknown }>(
			'UPDATE websites SET verification_code = $code, verified_at = time::now() WHERE id = type::record($id) RETURN verified_at;',
			{
			id: websiteRecordId,
			code
			}
		);
		expect(markVerified?.verified_at).toBeTruthy();
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
		const code = generateWebsiteVerificationCode();
		const markVerified = await adminOne<{ verified_at: unknown }>(
			'UPDATE websites SET verification_code = $code, verified_at = time::now() WHERE id = type::record($id) RETURN verified_at;',
			{
			id: normalizeRecordId(website.json.data.website.id),
			code
			}
		);
		expect(markVerified?.verified_at).toBeTruthy();

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

	test('results endpoints include expires_in for ssl/domain', async () => {
		const user = await registerUser('core_results_exp');
		const client = new ApiTestClient({ bearerToken: user.token });

		const website = await client.call({
			method: 'POST',
			path: '/api/v1/websites',
			body: {
				url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
				description: 'Expiry website'
			}
		});
		expect(website.response.status).toBe(201);

		const websiteRecordId = normalizeRecordId(website.json.data.website.id);
		const code = generateWebsiteVerificationCode();
		const markVerified = await adminOne<{ verified_at: unknown }>(
			'UPDATE websites SET verification_code = $code, verified_at = time::now() WHERE id = type::record($id) RETURN verified_at;',
			{ id: websiteRecordId, code }
		);
		expect(markVerified?.verified_at).toBeTruthy();

		const job = await client.call({
			method: 'POST',
			path: '/api/v1/jobs',
			body: { website: websiteRecordId, types: ['ssl', 'domain'] }
		});
		expect(job.response.status).toBe(201);
		const jobId = normalizeRecordId(job.json.data.job.id);

		const validTo = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
		const expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

		const sslResult = await adminOne<{ id: string }>(
			`CREATE ssl_results CONTENT {
				job: type::record($jobId),
				protocol: 'TLSv1.3',
				valid_from: time::now(),
				valid_to: <datetime>$validTo,
				owner: { domain: 'example.test', name: 'Example', country: 'US', address: 'N/A' },
				issuer: { domain: 'ca.example', name: 'CA', country: 'US' }
			} RETURN AFTER;`,
			{ jobId, validTo }
		);
		expect(sslResult?.id).toBeTruthy();

		const domainResult = await adminOne<{ id: string }>(
			`CREATE domain_results CONTENT {
				job: type::record($jobId),
				domain: 'example.test',
				tld: 'test',
				punycodeName: NONE,
				unicodeName: NONE,
				isIDN: false,
				registrar: { name: 'Registrar', ianaId: '1', url: NONE, email: NONE, phone: NONE },
				statuses: [],
				transferLock: false,
				creationDate: time::now(),
				updatedDate: time::now(),
				expirationDate: <datetime>$expirationDate,
				dnssecEnabled: false,
				privacyEnabled: false,
				nameservers: [],
				records: {}
			} RETURN AFTER;`,
			{ jobId, expirationDate }
		);
		expect(domainResult?.id).toBeTruthy();
		if (!sslResult?.id || !domainResult?.id) {
			throw new Error('Failed to create ssl/domain test results');
		}

		await adminOne(
			'UPDATE jobs SET ssl = type::record($sslId), domain = type::record($domainId) WHERE id = type::record($jobId);',
			{
				jobId,
				sslId: normalizeRecordId(sslResult.id),
				domainId: normalizeRecordId(domainResult.id)
			}
		);

		const aggregate = await client.call({ method: 'GET', path: `/api/v1/results/jobs/${jobId}` });
		expect(aggregate.response.status).toBe(200);
		expect(typeof aggregate.json.data.job.ssl.expires_in).toBe('number');
		expect(typeof aggregate.json.data.job.domain.expires_in).toBe('number');

		const sslTool = await client.call({ method: 'GET', path: `/api/v1/results/jobs/${jobId}/ssl` });
		expect(sslTool.response.status).toBe(200);
		expect(typeof sslTool.json.data.result.expires_in).toBe('number');

		const domainTool = await client.call({ method: 'GET', path: `/api/v1/results/jobs/${jobId}/domain` });
		expect(domainTool.response.status).toBe(200);
		expect(typeof domainTool.json.data.result.expires_in).toBe('number');
	});

	test('websites and jobs list endpoints support pagination with total_items', async () => {
		const user = await registerUser('core_pagination');
		const client = new ApiTestClient({ bearerToken: user.token });

		for (let i = 0; i < 3; i += 1) {
			const website = await client.call({
				method: 'POST',
				path: '/api/v1/websites',
				body: {
					url: `https://${Math.random().toString(36).slice(2, 8)}-${i}.example.test`,
					description: `Paginated website ${i}`
				}
			});
			expect(website.response.status).toBe(201);
			const code = generateWebsiteVerificationCode();
			const markVerified = await adminOne<{ verified_at: unknown }>(
				'UPDATE websites SET verification_code = $code, verified_at = time::now() WHERE id = type::record($id) RETURN verified_at;',
				{
				id: normalizeRecordId(website.json.data.website.id),
				code
				}
			);
			expect(markVerified?.verified_at).toBeTruthy();

			const job = await client.call({
				method: 'POST',
				path: '/api/v1/jobs',
				body: {
					website: normalizeRecordId(website.json.data.website.id),
					types: ['seo']
				}
			});
			expect(job.response.status).toBe(201);
		}

		const websitesPage = await client.call({ method: 'GET', path: '/api/v1/websites?page=1&page_size=2' });
		expect(websitesPage.response.status).toBe(200);
		expect(websitesPage.json.data.websites.length).toBe(2);
		expect(websitesPage.json.data.total_items).toBe(3);
		expect(websitesPage.json.data.page).toBe(1);
		expect(websitesPage.json.data.page_size).toBe(2);

		const jobsPage = await client.call({ method: 'GET', path: '/api/v1/jobs?page=2&page_size=2' });
		expect(jobsPage.response.status).toBe(200);
		expect(jobsPage.json.data.jobs.length).toBe(1);
		expect(jobsPage.json.data.total_items).toBe(3);
		expect(jobsPage.json.data.page).toBe(2);
		expect(jobsPage.json.data.page_size).toBe(2);

		const badPartial = await client.call({ method: 'GET', path: '/api/v1/jobs?page=1' });
		expect(badPartial.response.status).toBe(400);
		expect(badPartial.json.error.code).toBe('bad_request');
	});
});
