import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const name = String(formData.get('name') ?? '').trim();
		const appriseUrl = String(formData.get('apprise_url') ?? '').trim();
		if (!name) {
			return fail(400, { create_error: 'Name is required.' });
		}
		if (!appriseUrl) {
			return fail(400, { create_error: 'Apprise URL is required.' });
		}

		try {
			await callDashboardApi(event, '/api/v1/notification-channels', {
				method: 'POST',
				body: { name, apprise_url: appriseUrl }
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { create_error: error.message });
			}
			throw error;
		}

		throw redirect(303, '/notifications/channels');
	}
};
