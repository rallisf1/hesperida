import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createUser, createWebsite, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';
import { normalizeRecordId, toRouteId } from '../helpers/ids';
import { signinExistingUser } from '../helpers/fixtures';

setDefaultTimeout(30_000);

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'SMTP_FROM'] as const;

const withSmtpDisabled = async (work: () => Promise<void>): Promise<void> => {
	const original = Object.fromEntries(SMTP_KEYS.map((key) => [key, Bun.env[key]])) as Record<
		string,
		string | undefined
	>;
	for (const key of SMTP_KEYS) {
		Bun.env[key] = '';
	}
	try {
		await work();
	} finally {
		for (const key of SMTP_KEYS) {
			const value = original[key];
			if (typeof value === 'string') {
				Bun.env[key] = value;
			} else {
				delete Bun.env[key];
			}
		}
	}
};

describe('API SMTP gating integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('POST /api/v1/auth/forgot returns 503 when SMTP is not configured', async () => {
		const email = randomEmail('forgot_smtp_disabled');
		const user = await createUser({
			name: 'Forgot SMTP Disabled',
			email,
			password: 'pass12345',
			role: 'editor'
		});
		if (!user) throw new Error('Failed to create user');

		await withSmtpDisabled(async () => {
			const client = new ApiTestClient({ apiKey: null });
			const res = await client.call({
				method: 'POST',
				path: '/api/v1/auth/forgot',
				body: { email }
			});

			expect(res.response.status).toBe(503);
			expect(res.json.error.code).toBe('smtp_not_configured');
		});

		const refreshed = await adminOne<{ forgot_token?: string | null }>(
			'SELECT forgot_token FROM users WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(user.id) }
		);
		expect(refreshed?.forgot_token ?? null).toBeNull();
	});

	test('POST /api/v1/users returns 503 when SMTP is not configured', async () => {
		const adminEmail = randomEmail('users_create_admin');
		const adminPassword = 'pass12345';
		const admin = await createUser({
			name: 'Users Create Admin',
			email: adminEmail,
			password: adminPassword,
			role: 'admin'
		});
		if (!admin) throw new Error('Failed to create admin');

		const token = await signinExistingUser(adminEmail, adminPassword);
		const client = new ApiTestClient({ bearerToken: token });
		const newUserEmail = randomEmail('users_create_target');

		await withSmtpDisabled(async () => {
			const res = await client.call({
				method: 'POST',
				path: '/api/v1/users',
				body: {
					name: 'Blocked User',
					email: newUserEmail,
					role: 'viewer'
				}
			});

			expect(res.response.status).toBe(503);
			expect(res.json.error.code).toBe('smtp_not_configured');
		});

		const created = await adminOne<{ id?: string }>(
			'SELECT id FROM users WHERE email = $email LIMIT 1;',
			{ email: newUserEmail }
		);
		expect(created?.id).toBeUndefined();
	});

	test('POST /api/v1/websites/:id/invite returns 503 when SMTP is not configured', async () => {
		const ownerEmail = randomEmail('invite_smtp_owner');
		const ownerPassword = 'pass12345';
		const owner = await createUser({
			name: 'Invite SMTP Owner',
			email: ownerEmail,
			password: ownerPassword,
			role: 'editor'
		});
		if (!owner) throw new Error('Failed to create owner');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'smtp invite website'
		});
		if (!website) throw new Error('Failed to create website');

		const token = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: token });
		const inviteeEmail = randomEmail('invite_smtp_target');

		await withSmtpDisabled(async () => {
			const res = await client.call({
				method: 'POST',
				path: `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/invite`,
				body: { email: inviteeEmail, role: 'viewer' }
			});

			expect(res.response.status).toBe(503);
			expect(res.json.error.code).toBe('smtp_not_configured');
		});

		const invited = await adminOne<{ id?: string }>(
			'SELECT id FROM users WHERE email = $email LIMIT 1;',
			{ email: inviteeEmail }
		);
		expect(invited?.id).toBeUndefined();
	});

	test('POST /api/v1/websites/:id/transfer-ownership returns 503 when SMTP is not configured', async () => {
		const ownerEmail = randomEmail('transfer_smtp_owner');
		const ownerPassword = 'pass12345';
		const owner = await createUser({
			name: 'Transfer SMTP Owner',
			email: ownerEmail,
			password: ownerPassword,
			role: 'editor'
		});
		if (!owner) throw new Error('Failed to create owner');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'smtp transfer website'
		});
		if (!website) throw new Error('Failed to create website');

		const token = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: token });
		const targetEmail = randomEmail('transfer_smtp_target');

		await withSmtpDisabled(async () => {
			const res = await client.call({
				method: 'POST',
				path: `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/transfer-ownership`,
				body: { email: targetEmail, keep_previous_owner_access: true }
			});

			expect(res.response.status).toBe(503);
			expect(res.json.error.code).toBe('smtp_not_configured');
		});

		const refreshed = await adminOne<{ owner?: string }>(
			'SELECT owner FROM websites WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(website.id) }
		);
		expect(refreshed?.owner).toBeTruthy();
		expect(normalizeRecordId(refreshed?.owner)).toBe(normalizeRecordId(owner.id));
	});
});
