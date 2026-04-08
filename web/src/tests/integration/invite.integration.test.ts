import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createUser, createWebsite, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';
import { normalizeRecordId, toRouteId } from '../helpers/ids';
import { signinExistingUser } from '../helpers/fixtures';

setDefaultTimeout(30_000);

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

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });

		const invitePath = `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/invite`;
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

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });

		const invite = await client.call({
			method: 'POST',
			path: `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/invite`,
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

		const viewerToken = await signinExistingUser(viewerEmail, viewerPassword);
		const client = new ApiTestClient({ bearerToken: viewerToken });

		const res = await client.call({
			method: 'POST',
			path: `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/invite`,
			body: { email: randomEmail('should_fail_invite') }
		});

		expect(res.response.status).toBe(403);
		expect(res.json.error.code).toBe('forbidden');
	});

	test('invite fails when notification delivery fails and does not add member', async () => {
		const ownerEmail = randomEmail('invite_owner_fail');
		const ownerPassword = 'pass12345';
		const inviteeEmail = randomEmail('invitee_fail');

		const owner = await createUser({ name: 'Invite Owner Fail', email: ownerEmail, password: ownerPassword, role: 'editor' });
		const invitee = await createUser({
			name: 'Invitee Fail',
			email: inviteeEmail,
			password: 'pass12345',
			role: 'viewer'
		});
		if (!owner || !invitee) throw new Error('Failed to create users');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'invite fail website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });
		const invitePath = `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/invite`;

		const res = await client.call({
			method: 'POST',
			path: invitePath,
			body: { email: inviteeEmail }
		});
		expect(res.response.status).toBe(502);
		expect(res.json.error.code).toBe('notification_failed');

		const refreshed = await adminOne<{ users?: string[] }>('SELECT users FROM websites WHERE id = type::record($id) LIMIT 1;', {
			id: normalizeRecordId(website.id)
		});
		const userIds = (refreshed?.users ?? []).map((id) => String(id));
		expect(userIds.includes(normalizeRecordId(invitee.id))).toBeFalse();
	});

	test('editor member can uninvite existing member by email', async () => {
		const ownerEmail = randomEmail('uninvite_owner');
		const ownerPassword = 'pass12345';
		const memberEmail = randomEmail('uninvite_member');
		const memberPassword = 'pass12345';

		const owner = await createUser({ name: 'Uninvite Owner', email: ownerEmail, password: ownerPassword, role: 'editor' });
		const member = await createUser({ name: 'Uninvite Member', email: memberEmail, password: memberPassword, role: 'viewer' });
		if (!owner || !member) throw new Error('Failed to create users');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'uninvite website'
		});
		if (!website) throw new Error('Failed to create website');

		await adminOne(
			'UPDATE websites SET users = array::distinct(array::append(users, type::record($memberId))) WHERE id = type::record($id) RETURN AFTER;',
			{
				id: normalizeRecordId(website.id),
				memberId: normalizeRecordId(member.id)
			}
		);

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });
		const res = await client.call({
			method: 'POST',
			path: `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/uninvite`,
			body: { email: memberEmail }
		});

		expect(res.response.status).toBe(200);
		expect(res.json.data.removed).toBeTrue();

		const refreshed = await adminOne<{ users?: string[] }>(
			'SELECT users FROM websites WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(website.id) }
		);
		const users = (refreshed?.users ?? []).map((id) => String(id));
		expect(users.includes(normalizeRecordId(member.id))).toBeFalse();
	});

	test('uninvite rejects owner email and unknown users', async () => {
		const ownerEmail = randomEmail('uninvite_owner_reject');
		const ownerPassword = 'pass12345';
		const owner = await createUser({ name: 'Uninvite Owner Reject', email: ownerEmail, password: ownerPassword, role: 'editor' });
		if (!owner) throw new Error('Failed to create owner');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'uninvite reject website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });

		const ownerRes = await client.call({
			method: 'POST',
			path: `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/uninvite`,
			body: { email: ownerEmail }
		});
		expect(ownerRes.response.status).toBe(400);
		expect(ownerRes.json.error.code).toBe('owner_cannot_be_uninvited');

		const unknownRes = await client.call({
			method: 'POST',
			path: `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/uninvite`,
			body: { email: randomEmail('not_found_uninvite') }
		});
		expect(unknownRes.response.status).toBe(404);
		expect(unknownRes.json.error.code).toBe('not_found');
	});

	test('viewer cannot uninvite users', async () => {
		const ownerEmail = randomEmail('uninvite_owner_viewer');
		const ownerPassword = 'pass12345';
		const viewerEmail = randomEmail('uninvite_viewer');
		const viewerPassword = 'pass12345';

		const owner = await createUser({ name: 'Uninvite Owner Viewer', email: ownerEmail, password: ownerPassword, role: 'editor' });
		const viewer = await createUser({ name: 'Uninvite Viewer', email: viewerEmail, password: viewerPassword, role: 'viewer' });
		if (!owner || !viewer) throw new Error('Failed to create users');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'uninvite viewer website'
		});
		if (!website) throw new Error('Failed to create website');

		await adminOne(
			'UPDATE websites SET users = array::distinct(array::append(users, type::record($viewerId))) WHERE id = type::record($id) RETURN AFTER;',
			{ id: normalizeRecordId(website.id), viewerId: normalizeRecordId(viewer.id) }
		);

		const viewerToken = await signinExistingUser(viewerEmail, viewerPassword);
		const client = new ApiTestClient({ bearerToken: viewerToken });
		const res = await client.call({
			method: 'POST',
			path: `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/uninvite`,
			body: { email: randomEmail('uninvite_fail_viewer') }
		});

		expect(res.response.status).toBe(403);
		expect(res.json.error.code).toBe('forbidden');
	});
});
