import { fail, redirect, type Actions } from '@sveltejs/kit';
import { config } from '$lib/server/config';

type ApiEnvelope =
	| { ok: true; data?: { token?: string } }
	| { ok: false; error?: { message?: string } };

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required.', values: { email } });
		}

		const response = await event.fetch('/api/v1/auth/signin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password })
		});

		let payload: ApiEnvelope | null = null;
		try {
			payload = (await response.json()) as ApiEnvelope;
		} catch {
			payload = null;
		}

		if (!response.ok || !payload?.ok) {
			return fail(response.status >= 400 && response.status < 600 ? response.status : 400, {
				error: 'Wrong email or password.',
				values: { email }
			});
		}

		const token = payload.data?.token?.trim();
		if (token) {
			event.cookies.set(config.sessionCookieName, token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: config.sessionCookieSecure,
				maxAge: config.sessionCookieMaxAge
			});
		}

		throw redirect(303, '/');
	}
};
