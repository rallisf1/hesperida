import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createUser, createWebsite, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';

setDefaultTimeout(30_000);

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

const routeId = (recordId: string): string => recordId.split(':').slice(1).join(':');

const signin = async (email: string, password: string): Promise<string> => {
	const client = new ApiTestClient({ apiKey: null });
	const res = await client.call({
		method: 'POST',
		path: '/api/v1/auth/signin',
		body: { email, password }
	});
	if (res.response.status !== 200) throw new Error(`Signin failed: ${res.response.status}`);
	return res.json.data.token as string;
};

describe('API Website Invite Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('editor member can invite existing user and dedupe membership', async () => {
		const ownerEmail = randomEmail('invite_owner');
		const ownerPassword = 'pass12345';
		const inviteeEmail = randomEmail('invite_existing');
		const inviteePassword = 'pass12345';

		const owner = await createUser({ name: 'Invite Owner', email: ownerEmail, password: ownerPassword, role: 'editor' });
		const invitee = await createUser({ name: 'Invite Existing', email: inviteeEmail, password: inviteePassword, role: 'viewer' });
		if (!owner || !invitee) throw new Error('Failed to create users');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'invite website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerToken = await signin(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });

		const invitePath = `/api/v1/websites/${encodeURIComponent(routeId(normalizeRecordId(website.id)))}/invite`;
		const firstInvite = await client.call({
			method: 'POST',
			path: invitePath,
			body: { email: inviteeEmail }
		});
		expect(firstInvite.response.status).toBe(200);
		expect(firstInvite.json.ok).toBeTrue();

		const secondInvite = await client.call({
			method: 'POST',
			path: invitePath,
			body: { email: inviteeEmail }
		});
		expect(secondInvite.response.status).toBe(200);

		const refreshed = await adminOne<{ users?: string[] }>('SELECT users FROM websites WHERE id = type::record($id) LIMIT 1;', {
			id: normalizeRecordId(website.id)
		});
		const userIds = (refreshed?.users ?? []).map((id) => String(id));
		const inviteeId = normalizeRecordId(invitee.id);
		expect(userIds.filter((id) => id === inviteeId).length).toBe(1);
	});

	test('invite unknown email creates placeholder user with forgot token', async () => {
		const ownerEmail = randomEmail('invite_owner_unknown');
		const ownerPassword = 'pass12345';
		const unknownEmail = randomEmail('invite_unknown');

		const owner = await createUser({ name: 'Invite Owner 2', email: ownerEmail, password: ownerPassword, role: 'editor' });
		if (!owner) throw new Error('Failed to create owner');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'invite unknown website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerToken = await signin(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });

		const invite = await client.call({
			method: 'POST',
			path: `/api/v1/websites/${encodeURIComponent(routeId(normalizeRecordId(website.id)))}/invite`,
			body: { email: unknownEmail }
		});
		expect(invite.response.status).toBe(200);

		const createdUser = await adminOne<{ id: string; role?: string; forgot_token?: string | null }>(
			'SELECT id, role, forgot_token FROM users WHERE email = $email LIMIT 1;',
			{ email: unknownEmail }
		);
		expect(createdUser).toBeTruthy();
		expect(createdUser?.role).toBe('viewer');
		expect(createdUser?.forgot_token).toBeTruthy();
	});

	test('viewer member cannot invite', async () => {
		const ownerEmail = randomEmail('invite_owner_viewer');
		const ownerPassword = 'pass12345';
		const viewerEmail = randomEmail('invite_viewer');
		const viewerPassword = 'pass12345';

		const owner = await createUser({ name: 'Invite Owner 3', email: ownerEmail, password: ownerPassword, role: 'editor' });
		const viewer = await createUser({ name: 'Invite Viewer', email: viewerEmail, password: viewerPassword, role: 'viewer' });
		if (!owner || !viewer) throw new Error('Failed to create users');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'viewer invite website'
		});
		if (!website) throw new Error('Failed to create website');

		await adminOne(
			'UPDATE websites SET users = array::distinct(array::append(users, type::record($viewerId))) WHERE id = type::record($id) RETURN AFTER;',
			{
			id: normalizeRecordId(website.id),
			viewerId: normalizeRecordId(viewer.id)
			}
		);

		const viewerToken = await signin(viewerEmail, viewerPassword);
		const client = new ApiTestClient({ bearerToken: viewerToken });

		const res = await client.call({
			method: 'POST',
			path: `/api/v1/websites/${encodeURIComponent(routeId(normalizeRecordId(website.id)))}/invite`,
			body: { email: randomEmail('should_fail_invite') }
		});

		expect(res.response.status).toBe(403);
		expect(res.json.error.code).toBe('forbidden');
	});
});
