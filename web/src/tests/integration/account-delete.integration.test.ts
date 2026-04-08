import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createWebsite, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient } from '../helpers/request';
import { createAndSigninUser } from '../helpers/fixtures';
import { normalizeRecordId } from '../helpers/ids';

setDefaultTimeout(30_000);

describe('API Account Deletion Event Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('deleting member user removes membership from websites.users', async () => {
		const owner = await createAndSigninUser('Owner User', 'editor');
		const member = await createAndSigninUser('Member User', 'editor');

		const website = await createWebsite({
			user: owner.userId,
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'membership website'
		});
		if (!website) throw new Error('Failed to create website');

		await adminOne(
			'UPDATE websites SET users = array::distinct(array::append(users, type::record($memberId))) WHERE id = type::record($id) RETURN AFTER;',
			{ id: normalizeRecordId(website.id), memberId: member.userId }
		);

		const memberClient = new ApiTestClient({ bearerToken: member.token });
		const del = await memberClient.call({
			method: 'DELETE',
			path: '/api/v1/users/me',
			body: { password: member.password }
		});
		expect(del.response.status).toBe(200);

		const refreshed = await adminOne<{ users?: string[] }>(
			'SELECT users FROM websites WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(website.id) }
		);
		const users = (refreshed?.users ?? []).map((entry) => String(entry));
		expect(users.includes(member.userId)).toBeFalse();
	});

	test('deleting owner user still deletes owned websites', async () => {
		const owner = await createAndSigninUser('Owner Delete User', 'editor');
		const website = await createWebsite({
			user: owner.userId,
			url: `https://${Math.random().toString(36).slice(2, 8)}.example.test`,
			description: 'owned website'
		});
		if (!website) throw new Error('Failed to create website');

		const ownerClient = new ApiTestClient({ bearerToken: owner.token });
		const del = await ownerClient.call({
			method: 'DELETE',
			path: '/api/v1/users/me',
			body: { password: owner.password }
		});
		expect(del.response.status).toBe(200);

		const deletedWebsite = await adminOne<{ id: string }>(
			'SELECT id FROM websites WHERE id = type::record($id) LIMIT 1;',
			{ id: normalizeRecordId(website.id) }
		);
		expect(deletedWebsite).toBeNull();
	});
});
