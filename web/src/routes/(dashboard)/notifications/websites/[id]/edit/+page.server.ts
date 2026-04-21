import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import {
	mapNotificationChannelToView,
	mapWebsiteNotificationToView,
	mapWebsiteToView
} from '$lib/server/dashboard-mappers';
import type { ApiNotificationChannel, ApiWebsite, ApiWebsiteNotification } from '$lib/types/api';
import { parseWebsiteNotificationEventsForm } from '$lib/server/website-notification-form';

export const load: PageServerLoad = async (event) => {
	const id = event.params.id;
	const websitesQuery = new URLSearchParams({ page: '1', page_size: '200' });
	try {
		const [linkData, websitesData, channelsData] = await Promise.all([
			callDashboardApi<{ link: ApiWebsiteNotification }>(event, `/api/v1/website-notifications/${id}`),
			callDashboardApi<{ websites: ApiWebsite[] }>(event, '/api/v1/websites', {
				searchParams: websitesQuery
			}),
			callDashboardApi<{ channels: ApiNotificationChannel[] }>(event, '/api/v1/notification-channels')
		]);

		const link = mapWebsiteNotificationToView(linkData.link);
		const websites = (websitesData.websites ?? []).map(mapWebsiteToView);
		const channels = (channelsData.channels ?? []).map(mapNotificationChannelToView);
		const websiteUrl =
			link.website_url?.trim() ||
			websites.find((website) => website.id === link.website_id)?.url?.trim() ||
			link.website_id;
		const channelName =
			link.channel_name?.trim() ||
			channels.find((channel) => channel.id === link.notification_channel_id)?.name?.trim() ||
			link.notification_channel_id;

		return {
			link,
			websites,
			channels,
			breadcrumbEntityLabel: `${websiteUrl} [${channelName}]`,
			breadcrumbEntityHref: `/notifications/websites/${link.id}/edit`
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			throw redirect(303, `/notifications/websites?error=${encodeURIComponent(error.message)}`);
		}
		throw error;
	}
};

export const actions: Actions = {
	update: async (event) => {
		const id = event.params.id;
		const formData = await event.request.formData();
		const website = String(formData.get('website') ?? '').trim();
		const notificationChannel = String(formData.get('notification_channel') ?? '').trim();
		if (!website || !notificationChannel) {
			return fail(400, { update_error: 'Website and channel are required.' });
		}
		const events = parseWebsiteNotificationEventsForm(formData);
		if (!events) {
			return fail(400, { update_error: 'Threshold values must be valid numbers between 0 and 100.' });
		}

		try {
			await callDashboardApi(event, `/api/v1/website-notifications/${id}`, {
				method: 'PATCH',
				body: {
					website,
					notification_channel: notificationChannel,
					events
				}
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { update_error: error.message });
			}
			throw error;
		}

		throw redirect(303, '/notifications/websites');
	}
};
