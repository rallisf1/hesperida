import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { ensureSchema, resetData } from '../helpers/db';
import { ApiTestClient, randomEmail } from '../helpers/request';

setDefaultTimeout(30_000);

describe('API Auth Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('signup returns 400 for invalid JSON object payload', async () => {
		const client = new ApiTestClient({ apiKey: null });

		const { response, json } = await client.call({
			method: 'POST',
			path: '/api/v1/auth/signup',
			body: ['not-an-object']
		});

		expect(response.status).toBe(400);
		expect(json.ok).toBeFalse();
		expect(json.error.code).toBe('bad_request');
	});

	test('signup fails for duplicate email', async () => {
		const client = new ApiTestClient({ apiKey: null });
		const email = randomEmail('signup_dupe');
		const body = { name: 'Dup User', email, password: 'pass12345' };

		const first = await client.call({ method: 'POST', path: '/api/v1/auth/signup', body });
		expect(first.response.status).toBe(201);

		const second = await client.call({ method: 'POST', path: '/api/v1/auth/signup', body });
		expect(second.response.status).toBe(401);
		expect(second.json.ok).toBeFalse();
		expect(second.json.error.code).toBe('auth_failed');
	});

	test('signin returns 400 for invalid payload', async () => {
		const client = new ApiTestClient({ apiKey: null });
		const { response, json } = await client.call({
			method: 'POST',
			path: '/api/v1/auth/signin',
			body: { email: 'missing-password@example.test' }
		});

		expect(response.status).toBe(400);
		expect(json.ok).toBeFalse();
		expect(json.error.code).toBe('bad_request');
	});

	test('signin returns 401 for invalid credentials', async () => {
		const email = randomEmail('signin_bad');
		const password = 'pass12345';
		const authClient = new ApiTestClient({ apiKey: null });
		await authClient.call({
			method: 'POST',
			path: '/api/v1/auth/signup',
			body: { name: 'Bad Signin User', email, password }
		});

		const client = new ApiTestClient({ apiKey: null });
		const { response, json } = await client.call({
			method: 'POST',
			path: '/api/v1/auth/signin',
			body: { email, password: 'wrong-password' }
		});

		expect(response.status).toBe(401);
		expect(json.ok).toBeFalse();
		expect(json.error.code).toBe('auth_failed');
	});

	test('auth/me requires authentication', async () => {
		const client = new ApiTestClient({ apiKey: null });
		const { response, json } = await client.call({ method: 'GET', path: '/api/v1/auth/me' });

		expect(response.status).toBe(401);
		expect(json.ok).toBeFalse();
		expect(json.error.code).toBe('unauthorized');
	});

	test('signout clears session cookie', async () => {
		const client = new ApiTestClient({ apiKey: null });
		const email = randomEmail('signout');
		const password = 'pass12345';

		await client.call({
			method: 'POST',
			path: '/api/v1/auth/signup',
			body: { name: 'Signout User', email, password }
		});

		const beforeSignout = await client.call({ method: 'GET', path: '/api/v1/auth/me' });
		expect(beforeSignout.response.status).toBe(200);

		const signout = await client.call({ method: 'POST', path: '/api/v1/auth/signout' });
		expect(signout.response.status).toBe(200);

		const afterSignout = await client.call({ method: 'GET', path: '/api/v1/auth/me' });
		expect(afterSignout.response.status).toBe(401);
	});

	test('auth route rate-limit triggers on repeated auth requests', async () => {
		const client = new ApiTestClient({ apiKey: null });
		const ip = `10.0.0.${Math.floor(Math.random() * 100) + 1}`;
		let lastStatus = 0;
		let lastResponse: Response | null = null;

		for (let i = 0; i < 31; i += 1) {
			const res = await client.call({
				method: 'POST',
				path: '/api/v1/auth/signin',
				clientAddress: ip,
				body: { email: 'no-user@example.test', password: 'no-pass' }
			});
			lastStatus = res.response.status;
			lastResponse = res.response;
		}

		expect(lastStatus).toBe(429);
		expect(lastResponse?.headers.get('retry-after')).toBeTruthy();
	});

	test('users/me delete removes account and invalidates session', async () => {
		const client = new ApiTestClient();
		const email = randomEmail('delete_me');
		const password = 'pass12345';

		const signup = await client.call({
			method: 'POST',
			path: '/api/v1/auth/signup',
			body: { name: 'Delete Me', email, password }
		});
		expect(signup.response.status).toBe(201);

		const del = await client.call({
			method: 'DELETE',
			path: '/api/v1/users/me',
			body: { password }
		});
		expect(del.response.status).toBe(200);
		expect(del.json.ok).toBeTrue();

		const me = await client.call({ method: 'GET', path: '/api/v1/auth/me' });
		expect(me.response.status).toBe(401);
	});

	test('users/me delete validates password input', async () => {
		const client = new ApiTestClient();
		const email = randomEmail('delete_me_bad');
		const password = 'pass12345';

		await client.call({
			method: 'POST',
			path: '/api/v1/auth/signup',
			body: { name: 'Delete Me Bad', email, password }
		});

		const missing = await client.call({
			method: 'DELETE',
			path: '/api/v1/users/me',
			body: {}
		});
		expect(missing.response.status).toBe(400);
		expect(missing.json.error.code).toBe('bad_request');

		const invalid = await client.call({
			method: 'DELETE',
			path: '/api/v1/users/me',
			body: { password: 'wrong-password' }
		});
		expect(invalid.response.status).toBe(401);
		expect(invalid.json.error.code).toBe('auth_failed');
	});
});
