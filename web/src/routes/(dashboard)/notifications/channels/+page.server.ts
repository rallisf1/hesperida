import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapNotificationChannelToView } from '$lib/server/dashboard-mappers';
import type { ApiNotificationChannel } from '$lib/types/api';

export const load: PageServerLoad = async (event) => {
	const urlError = event.url.searchParams.get('error')?.trim() || null;
	try {
		const data = await callDashboardApi<{ channels: ApiNotificationChannel[] }>(
			event,
			'/api/v1/notification-channels'
		);

		return {
			channels: (data.channels ?? []).map(mapNotificationChannelToView),
			error: urlError
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return {
				channels: [],
				error: urlError ?? error.message
			};
		}
		throw error;
	}
};

export const actions: Actions = {
	deleteChannel: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) return fail(400, { channel_error: 'Channel ID is required.' });

		try {
			await callDashboardApi(event, `/api/v1/notification-channels/${id}`, { method: 'DELETE' });
			return { success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { channel_error: error.message });
			}
			throw error;
		}
	},
	testChannel: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) return fail(400, { channel_error: 'Channel ID is required.' });

		try {
			await callDashboardApi(event, `/api/v1/notification-channels/${id}/test`, { method: 'POST' });
			return { success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { channel_error: error.message });
			}
			throw error;
		}
	}
};

