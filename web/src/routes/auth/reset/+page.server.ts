import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { ApiEnvelope } from '$lib/types/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get('token');
	return {
		token
	}
}

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const forgotToken = String(formData.get('forgot_token') ?? '').trim();
		const password = String(formData.get('password') ?? '');
		const confirmPassword = String(formData.get('confirm_password') ?? '');

		if (!forgotToken || !password) {
			return fail(400, { error: 'Reset token and password are required.' });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match.', values: { forgotToken } });
		}

		const response = await event.fetch('/api/v1/auth/forgot', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ forgot_token: forgotToken, password })
		});

		let payload: ApiEnvelope<{ success?: boolean }> | null = null;
		try {
			payload = (await response.json()) as ApiEnvelope<{ success?: boolean }>;
		} catch {
			payload = null;
		}

		if (!response.ok || !payload?.ok) {
			const message = payload && 'error' in payload ? payload.error?.message : null;
			return fail(response.status >= 400 && response.status < 600 ? response.status : 400, {
				error: message ?? 'Password reset failed.',
				values: { forgotToken }
			});
		}

		throw redirect(303, '/auth/signin');
	}
};
