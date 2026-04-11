import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { tools } from '$lib/constants';
import type { Tool, Website } from '$lib/types';

export const load: PageServerLoad = async (event) => {
	const websitesData = await callDashboardApi<{ websites: Website[] }>(event, '/api/v1/websites');
	return {
		websites: websitesData.websites ?? [],
		tools
	};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const website = String(formData.get('website') ?? '').trim();
		const selectedTools = formData.getAll('types').map((v) => String(v).trim()) as Tool[];
		const optionsRaw = String(formData.get('options') ?? '').trim();

		if (!website || selectedTools.length === 0) {
			return fail(400, { error: 'website and at least one tool are required.' });
		}

		let options: Record<string, unknown> | undefined = undefined;
		if (optionsRaw) {
			try {
				const parsed = JSON.parse(optionsRaw);
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					return fail(400, { error: 'options must be a JSON object.' });
				}
				options = parsed as Record<string, unknown>;
			} catch {
				return fail(400, { error: 'options must be valid JSON.' });
			}
		}

		try {
			await callDashboardApi(event, '/api/v1/jobs', {
				method: 'POST',
				body: {
					website,
					types: selectedTools,
					...(options ? { options } : {})
				}
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { error: error.message });
			}
			throw error;
		}

		throw redirect(303, '/jobs');
	}
};
