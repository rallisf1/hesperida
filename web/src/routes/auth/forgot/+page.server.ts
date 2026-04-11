import { fail, type Actions } from '@sveltejs/kit';
import type { ApiEnvelope } from '$lib/types';

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '').trim();

		if (!email) {
			return fail(400, { error: 'Email is required.', values: { email } });
		}

		const response = await event.fetch('/api/v1/auth/forgot', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email })
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
				error: message ?? 'Failed to start password reset.',
				values: { email }
			});
		}

		return {
			success: 'If the account exists, a reset message has been sent.',
			values: { email: '' }
		};
	}
};
