import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';

export const load: PageServerLoad = async () => ({});

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const url = String(formData.get('url') ?? '').trim();
		const description = String(formData.get('description') ?? '').trim();

		if (!url || !description) {
			return fail(400, { error: 'url and description are required.', values: { url, description } });
		}

		try {
			await callDashboardApi(event, '/api/v1/websites', {
				method: 'POST',
				body: { url, description }
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { error: error.message, values: { url, description } });
			}
			throw error;
		}

		throw redirect(303, '/websites');
	}
};
