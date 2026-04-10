import { fail, redirect, type Actions } from '@sveltejs/kit';
import { config } from '$lib/server/config';

type ApiEnvelope =
	| { ok: true; data?: { token?: string } }
	| { ok: false; error?: { message?: string } };

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const name = String(formData.get('name') ?? '').trim();
		const email = String(formData.get('email') ?? '').trim();
		const password = String(formData.get('password') ?? '');
		const confirmPassword = String(formData.get('confirm_password') ?? '');

		if (!name || !email || !password) {
			return fail(400, { error: 'Name, email and password are required.', values: { name, email } });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match.', values: { name, email } });
		}

		const response = await event.fetch('/api/v1/auth/signup', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, email, password })
		});

		let payload: ApiEnvelope | null = null;
		try {
			payload = (await response.json()) as ApiEnvelope;
		} catch {
			payload = null;
		}

		if (!response.ok || !payload?.ok) {
			const message = payload && 'error' in payload ? payload.error?.message : null;
			return fail(response.status >= 400 && response.status < 600 ? response.status : 400, {
				error: message ?? 'Sign up failed.',
				values: { name, email }
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
