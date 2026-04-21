import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import {
	mapNotificationChannelToView,
	mapWebsiteToView
} from '$lib/server/dashboard-mappers';
import type { ApiNotificationChannel, ApiWebsite } from '$lib/types/api';
import { defaultWebsiteNotificationEvents } from '$lib/website-notification-events';
import { parseWebsiteNotificationEventsForm } from '$lib/server/website-notification-form';

export const load: PageServerLoad = async (event) => {
	const websitePreset = event.url.searchParams.get('website')?.trim() ?? '';
	const websitesQuery = new URLSearchParams({ page: '1', page_size: '200' });
	try {
		const [websitesData, channelsData] = await Promise.all([
			callDashboardApi<{ websites: ApiWebsite[] }>(event, '/api/v1/websites', {
				searchParams: websitesQuery
			}),
			callDashboardApi<{ channels: ApiNotificationChannel[] }>(event, '/api/v1/notification-channels')
		]);
		return {
			websites: (websitesData.websites ?? []).map(mapWebsiteToView),
			channels: (channelsData.channels ?? []).map(mapNotificationChannelToView),
			websitePreset,
			defaultEvents: defaultWebsiteNotificationEvents()
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return {
				websites: [],
				channels: [],
				websitePreset,
				defaultEvents: defaultWebsiteNotificationEvents(),
				error: error.message
			};
		}
		throw error;
	}
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const website = String(formData.get('website') ?? '').trim();
		const notificationChannel = String(formData.get('notification_channel') ?? '').trim();
		if (!website || !notificationChannel) {
			return fail(400, { create_error: 'Website and channel are required.' });
		}

		const events = parseWebsiteNotificationEventsForm(formData);
		if (!events) {
			return fail(400, { create_error: 'Threshold values must be valid numbers between 0 and 100.' });
		}

		try {
			await callDashboardApi(event, '/api/v1/website-notifications', {
				method: 'POST',
				body: {
					website,
					notification_channel: notificationChannel,
					events
				}
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { create_error: error.message });
			}
			throw error;
		}

		throw redirect(303, '/notifications/websites');
	}
};
