import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient } from '../helpers/request';
import { createAndSigninUser } from '../helpers/fixtures';

setDefaultTimeout(30_000);

describe('API Notification Targets Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('list/create/update/test/delete target lifecycle', async () => {
		const user = await createAndSigninUser('Notify User');
		const client = new ApiTestClient({ bearerToken: user.token });

		const list0 = await client.call({ method: 'GET', path: '/api/v1/users/me/notification-targets' });
		expect(list0.response.status).toBe(200);
		expect(list0.json.data.targets).toEqual([]);

		const create = await client.call({
			method: 'POST',
			path: '/api/v1/users/me/notification-targets',
			body: { target: 'mailto://notify@example.test', label: 'Email A' }
		});
		expect(create.response.status).toBe(201);
		const createdId = String(create.json.data.target.id);
		expect(createdId).toBeTruthy();

		const testSend = await client.call({
			method: 'POST',
			path: `/api/v1/users/me/notification-targets/${encodeURIComponent(createdId)}/test`
		});
		expect(testSend.response.status).toBe(200);

		const update = await client.call({
			method: 'PATCH',
			path: `/api/v1/users/me/notification-targets/${encodeURIComponent(createdId)}`,
			body: { target: 'mailto://notify2@example.test', label: 'Email B', enabled: false }
		});
		expect(update.response.status).toBe(200);
		expect(update.json.data.target.target).toBe('mailto://notify2@example.test');
		expect(update.json.data.target.enabled).toBeFalse();

		const remove = await client.call({
			method: 'DELETE',
			path: `/api/v1/users/me/notification-targets/${encodeURIComponent(createdId)}`
		});
		expect(remove.response.status).toBe(200);
		expect(remove.json.data.deleted).toBeTrue();

		const list1 = await client.call({ method: 'GET', path: '/api/v1/users/me/notification-targets' });
		expect(list1.response.status).toBe(200);
		expect(list1.json.data.targets).toEqual([]);
	});

	test('create and update require passing notification test', async () => {
		const user = await createAndSigninUser('Notify Fail User');
		const client = new ApiTestClient({ bearerToken: user.token });

		const createFail = await client.call({
			method: 'POST',
			path: '/api/v1/users/me/notification-targets',
			body: { target: 'mock://fail/target' }
		});
		expect(createFail.response.status).toBe(502);
		expect(createFail.json.error.code).toBe('notification_test_failed');

		const created = await client.call({
			method: 'POST',
			path: '/api/v1/users/me/notification-targets',
			body: { target: 'mailto://ok@example.test' }
		});
		expect(created.response.status).toBe(201);
		const id = String(created.json.data.target.id);

		const updateFail = await client.call({
			method: 'PATCH',
			path: `/api/v1/users/me/notification-targets/${encodeURIComponent(id)}`,
			body: { target: 'mock://fail/updated' }
		});
		expect(updateFail.response.status).toBe(502);
		expect(updateFail.json.error.code).toBe('notification_test_failed');

		const stored = await adminOne<{ notification_targets?: Array<{ id: string; target: string }> }>(
			'SELECT notification_targets FROM users WHERE id = type::record($id) LIMIT 1;',
			{ id: user.userId }
		);
		const row = (stored?.notification_targets ?? []).find((item) => item.id === id);
		expect(row?.target).toBe('mailto://ok@example.test');
	});
});
