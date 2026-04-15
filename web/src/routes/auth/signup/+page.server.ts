import { fail, redirect, type Actions } from '@sveltejs/kit';
import { setSessionCookies } from '$lib/server/auth';
import { config } from '$lib/server/config';
import type { ApiEnvelope } from '$lib/types/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (!config.authSignupEnabled) {
		throw redirect(303, '/auth/signin?signup=disabled');
	}
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		if (!config.authSignupEnabled) {
			throw redirect(303, '/auth/signin?signup=disabled');
		}

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

		let payload: ApiEnvelope<{ token?: string; refresh_token?: string | null }> | null = null;
		try {
			payload = (await response.json()) as ApiEnvelope<{ token?: string; refresh_token?: string | null }>;
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
			setSessionCookies(event, {
				access: token,
				refresh: payload.data?.refresh_token ?? null
			});
		}

		throw redirect(303, '/');
	}
};
