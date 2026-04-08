import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createUser, ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';

setDefaultTimeout(30_000);

const signin = async (email: string, password: string) => {
	const client = new ApiTestClient({ apiKey: null });
	return client.call({
		method: 'POST',
		path: '/api/v1/auth/signin',
		body: { email, password }
	});
};

describe('API Forgot Password Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('forgot POST returns 404 for unknown user', async () => {
		const client = new ApiTestClient({ apiKey: null });
		const res = await client.call({
			method: 'POST',
			path: '/api/v1/auth/forgot',
			body: { email: randomEmail('no_such_user') }
		});

		expect(res.response.status).toBe(404);
		expect(res.json.error.code).toBe('not_found');
	});

	test('forgot POST sets token and forgot PATCH resets password + clears token', async () => {
		const email = randomEmail('forgot_user');
		const oldPassword = 'oldpass123';
		const newPassword = 'newpass123';

		const user = await createUser({ name: 'Forgot User', email, password: oldPassword, role: 'editor' });
		if (!user) throw new Error('Failed to create forgot user');

		const client = new ApiTestClient({ apiKey: null });
		const requestReset = await client.call({
			method: 'POST',
			path: '/api/v1/auth/forgot',
			body: { email }
		});
		expect(requestReset.response.status).toBe(200);
		expect(requestReset.json.ok).toBeTrue();

		const withToken = await adminOne<{ forgot_token?: string | null }>(
			'SELECT forgot_token FROM users WHERE id = type::record($id) LIMIT 1;',
			{ id: String(user.id) }
		);
		const forgotToken = withToken?.forgot_token ?? '';
		expect(forgotToken).toBeTruthy();

		const invalidPatch = await client.call({
			method: 'PATCH',
			path: '/api/v1/auth/forgot',
			body: { forgot_token: 'invalid-token', password: newPassword }
		});
		expect(invalidPatch.response.status).toBe(404);
		expect(invalidPatch.json.error.code).toBe('not_found');

		const reset = await client.call({
			method: 'PATCH',
			path: '/api/v1/auth/forgot',
			body: { forgot_token: forgotToken, password: newPassword }
		});
		expect(reset.response.status).toBe(200);
		expect(reset.json.ok).toBeTrue();

		const tokenAfterReset = await adminOne<{ forgot_token?: string | null }>(
			'SELECT forgot_token FROM users WHERE id = type::record($id) LIMIT 1;',
			{ id: String(user.id) }
		);
		expect(tokenAfterReset?.forgot_token ?? null).toBeNull();

		const oldSignin = await signin(email, oldPassword);
		expect(oldSignin.response.status).toBe(401);

		const newSignin = await signin(email, newPassword);
		expect(newSignin.response.status).toBe(200);
		expect(newSignin.json.ok).toBeTrue();
	});
});

