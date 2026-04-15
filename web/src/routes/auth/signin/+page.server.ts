import { fail, redirect, type Actions } from '@sveltejs/kit';
import { setSessionCookies } from '$lib/server/auth';
import type { ApiEnvelope } from '$lib/types/api';
import { config } from '$lib/server/config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return {
		signupEnabled: config.authSignupEnabled,
		signupDisabled: event.url.searchParams.get('signup') === 'disabled'
	};
};

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

		let payload: ApiEnvelope<{ token?: string; refresh_token?: string | null }> | null = null;
		try {
			payload = (await response.json()) as ApiEnvelope<{ token?: string; refresh_token?: string | null }>;
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
			setSessionCookies(event, {
				access: token,
				refresh: payload.data?.refresh_token ?? null
			});
		}

		throw redirect(303, '/');
	}
};
