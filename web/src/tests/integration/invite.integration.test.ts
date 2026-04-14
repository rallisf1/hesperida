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
		const group = crypto.randomUUID();

		const owner = await createUser({ name: 'Invite Owner', email: ownerEmail, password: ownerPassword, role: 'editor', group });
		const invitee = await createUser({ name: 'Invite Existing', email: inviteeEmail, password: inviteePassword, role: 'viewer', group });
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
			body: { email: inviteeEmail, role: 'viewer' }
		});
		expect(firstInvite.response.status).toBe(200);
		expect(firstInvite.json.ok).toBeTrue();

		const secondInvite = await client.call({
			method: 'POST',
			path: invitePath,
			body: { email: inviteeEmail, role: 'viewer' }
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
			body: { email: unknownEmail, role: 'viewer' }
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
		const group = crypto.randomUUID();

		const owner = await createUser({ name: 'Invite Owner 3', email: ownerEmail, password: ownerPassword, role: 'editor', group });
		const viewer = await createUser({ name: 'Invite Viewer', email: viewerEmail, password: viewerPassword, role: 'viewer', group });
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
			body: { email: randomEmail('should_fail_invite'), role: 'viewer' }
		});

		expect(res.response.status).toBe(403);
		expect(res.json.error.code).toBe('forbidden');
	});

	test('invite fails when notification delivery fails and does not add member', async () => {
		const ownerEmail = randomEmail('invite_owner_fail');
		const ownerPassword = 'pass12345';
		const inviteeEmail = randomEmail('invitee_fail');
		const group = crypto.randomUUID();

		const owner = await createUser({ name: 'Invite Owner Fail', email: ownerEmail, password: ownerPassword, role: 'editor', group });
		const invitee = await createUser({
			name: 'Invitee Fail',
			email: inviteeEmail,
			password: 'pass12345',
			role: 'viewer',
			group
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
			body: { email: inviteeEmail, role: 'viewer' }
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
		const group = crypto.randomUUID();

		const owner = await createUser({ name: 'Uninvite Owner', email: ownerEmail, password: ownerPassword, role: 'editor', group });
		const member = await createUser({ name: 'Uninvite Member', email: memberEmail, password: memberPassword, role: 'viewer', group });
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

	test('owner can transfer ownership to existing user and keep previous owner as member', async () => {
		const ownerEmail = randomEmail('transfer_owner_keep');
		const ownerPassword = 'pass12345';
		const targetEmail = randomEmail('transfer_target_keep');
		const targetPassword = 'pass12345';
		const group = crypto.randomUUID();

		const owner = await createUser({
			name: 'Transfer Owner Keep',
			email: ownerEmail,
			password: ownerPassword,
			role: 'editor',
			group
		});
		const target = await createUser({
			name: 'Transfer Target Keep',
			email: targetEmail,
			password: targetPassword,
			role: 'viewer',
			group
		});
		if (!owner || !target) throw new Error('Failed to create users');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'transfer keep website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });
		const path = `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/transfer-ownership`;
		const res = await client.call({
			method: 'POST',
			path,
			body: {
				email: targetEmail,
				keep_previous_owner_access: true
			}
		});

		expect(res.response.status).toBe(200);
		expect(res.json.ok).toBeTrue();

		const refreshed = await adminOne<{ owner?: string; users?: string[] }>(
			'SELECT owner, users FROM websites WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(website.id) }
		);
		const ownerId = normalizeRecordId(refreshed?.owner);
		const members = (refreshed?.users ?? []).map((id) => normalizeRecordId(id));
		expect(ownerId).toBe(normalizeRecordId(target.id));
		expect(members.includes(normalizeRecordId(owner.id))).toBeTrue();
		expect(members.includes(normalizeRecordId(target.id))).toBeFalse();
	});

	test('owner can transfer ownership and remove previous owner access', async () => {
		const ownerEmail = randomEmail('transfer_owner_remove');
		const ownerPassword = 'pass12345';
		const targetEmail = randomEmail('transfer_target_remove');
		const targetPassword = 'pass12345';
		const group = crypto.randomUUID();

		const owner = await createUser({
			name: 'Transfer Owner Remove',
			email: ownerEmail,
			password: ownerPassword,
			role: 'editor',
			group
		});
		const target = await createUser({
			name: 'Transfer Target Remove',
			email: targetEmail,
			password: targetPassword,
			role: 'viewer',
			group
		});
		if (!owner || !target) throw new Error('Failed to create users');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'transfer remove website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });
		const path = `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/transfer-ownership`;
		const res = await client.call({
			method: 'POST',
			path,
			body: {
				email: targetEmail,
				keep_previous_owner_access: false
			}
		});

		expect(res.response.status).toBe(200);
		expect(res.json.ok).toBeTrue();

		const refreshed = await adminOne<{ owner?: string; users?: string[] }>(
			'SELECT owner, users FROM websites WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(website.id) }
		);
		const members = (refreshed?.users ?? []).map((id) => normalizeRecordId(id));
		expect(normalizeRecordId(refreshed?.owner)).toBe(normalizeRecordId(target.id));
		expect(members.includes(normalizeRecordId(owner.id))).toBeFalse();
	});

	test('owner can transfer ownership to unknown email and create placeholder user', async () => {
		const ownerEmail = randomEmail('transfer_owner_unknown');
		const ownerPassword = 'pass12345';
		const unknownEmail = randomEmail('transfer_unknown_user');

		const owner = await createUser({
			name: 'Transfer Owner Unknown',
			email: ownerEmail,
			password: ownerPassword,
			role: 'editor'
		});
		if (!owner) throw new Error('Failed to create owner');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'transfer unknown website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });
		const path = `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/transfer-ownership`;
		const res = await client.call({
			method: 'POST',
			path,
			body: { email: unknownEmail }
		});

		expect(res.response.status).toBe(200);

		const createdUser = await adminOne<{ id: string; role?: string; forgot_token?: string | null }>(
			'SELECT id, role, forgot_token FROM users WHERE email = $email LIMIT 1;',
			{ email: unknownEmail }
		);
		expect(createdUser).toBeTruthy();
		expect(createdUser?.role).toBe('editor');
		expect(createdUser?.forgot_token).toBeTruthy();

		const refreshed = await adminOne<{ owner?: string }>(
			'SELECT owner FROM websites WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(website.id) }
		);
		expect(normalizeRecordId(refreshed?.owner)).toBe(normalizeRecordId(createdUser!.id));
	});

	test('non-owner cannot transfer ownership', async () => {
		const ownerEmail = randomEmail('transfer_owner_forbidden');
		const ownerPassword = 'pass12345';
		const memberEmail = randomEmail('transfer_member_forbidden');
		const memberPassword = 'pass12345';
		const targetEmail = randomEmail('transfer_target_forbidden');
		const targetPassword = 'pass12345';
		const group = crypto.randomUUID();

		const owner = await createUser({ name: 'Owner Forbidden', email: ownerEmail, password: ownerPassword, role: 'editor', group });
		const member = await createUser({ name: 'Member Forbidden', email: memberEmail, password: memberPassword, role: 'editor', group });
		const target = await createUser({ name: 'Target Forbidden', email: targetEmail, password: targetPassword, role: 'viewer', group });
		if (!owner || !member || !target) throw new Error('Failed to create users');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'transfer forbidden website'
		});
		if (!website) throw new Error('Failed to create website');

		await adminOne(
			'UPDATE websites SET users = array::distinct(array::append(users, type::record($memberId))) WHERE id = type::record($id) RETURN AFTER;',
			{
				id: normalizeRecordId(website.id),
				memberId: normalizeRecordId(member.id)
			}
		);

		const memberToken = await signinExistingUser(memberEmail, memberPassword);
		const client = new ApiTestClient({ bearerToken: memberToken });
		const path = `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/transfer-ownership`;
		const res = await client.call({
			method: 'POST',
			path,
			body: { email: targetEmail }
		});

		expect(res.response.status).toBe(403);
		expect(res.json.error.code).toBe('forbidden');
	});

	test('transfer rejects self-transfer and rolls back on notification failure', async () => {
		const ownerEmail = randomEmail('transfer_owner_self');
		const ownerPassword = 'pass12345';
		const failEmail = `transfer_fail_${Math.random().toString(36).slice(2, 8)}@example.test`;

		const owner = await createUser({ name: 'Owner Self', email: ownerEmail, password: ownerPassword, role: 'editor' });
		if (!owner) throw new Error('Failed to create owner');

		const website = await createWebsite({
			user: normalizeRecordId(owner.id),
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'transfer self/fail website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerToken = await signinExistingUser(ownerEmail, ownerPassword);
		const client = new ApiTestClient({ bearerToken: ownerToken });
		const path = `/api/v1/websites/${encodeURIComponent(toRouteId(normalizeRecordId(website.id)))}/transfer-ownership`;

		const selfRes = await client.call({
			method: 'POST',
			path,
			body: { email: ownerEmail }
		});
		expect(selfRes.response.status).toBe(400);
		expect(selfRes.json.error.code).toBe('bad_request');

		const failRes = await client.call({
			method: 'POST',
			path,
			body: { email: failEmail }
		});
		expect(failRes.response.status).toBe(502);
		expect(failRes.json.error.code).toBe('notification_failed');

		const failedCreated = await adminOne<{ id: string }>(
			'SELECT id FROM users WHERE email = $email LIMIT 1;',
			{ email: failEmail }
		);
		expect(failedCreated).toBeNull();

		const refreshed = await adminOne<{ owner?: string }>(
			'SELECT owner FROM websites WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(website.id) }
		);
		expect(normalizeRecordId(refreshed?.owner)).toBe(normalizeRecordId(owner.id));
	});

	test('viewer cannot uninvite users', async () => {
		const ownerEmail = randomEmail('uninvite_owner_viewer');
		const ownerPassword = 'pass12345';
		const viewerEmail = randomEmail('uninvite_viewer');
		const viewerPassword = 'pass12345';
		const group = crypto.randomUUID();

		const owner = await createUser({ name: 'Uninvite Owner Viewer', email: ownerEmail, password: ownerPassword, role: 'editor', group });
		const viewer = await createUser({ name: 'Uninvite Viewer', email: viewerEmail, password: viewerPassword, role: 'viewer', group });
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
