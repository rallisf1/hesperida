import { createUser } from './db';
import { ApiTestClient, randomEmail } from './request';
import { normalizeRecordId } from './ids';

export const signinExistingUser = async (email: string, password: string): Promise<string> => {
	const client = new ApiTestClient({ apiKey: null });
	const res = await client.call({
		method: 'POST',
		path: '/api/v1/auth/signin',
		body: { email, password }
	});
	if (res.response.status !== 200) throw new Error(`Signin failed: ${res.response.status}`);
	return res.json.data.token as string;
};

export const createAndSigninUser = async (name: string, role: 'admin' | 'editor' | 'viewer' = 'editor') => {
	const email = randomEmail(name.toLowerCase().replace(/\W+/g, '_'));
	const password = 'pass12345';
	const created = await createUser({ name, email, password, role });
	if (!created) throw new Error('Failed to create test user');
	const token = await signinExistingUser(email, password);
	return { userId: normalizeRecordId(created.id), token, email, password };
};

