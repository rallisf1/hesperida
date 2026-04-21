import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapNotificationChannelToView } from '$lib/server/dashboard-mappers';
import type { ApiNotificationChannel } from '$lib/types/api';

export const load: PageServerLoad = async (event) => {
	const id = event.params.id;
	try {
		const data = await callDashboardApi<{ channel: ApiNotificationChannel }>(
			event,
			`/api/v1/notification-channels/${id}`
		);
		const channel = mapNotificationChannelToView(data.channel);
		const channelLabel = channel.name?.trim() || `Channel ${channel.id}`;
		return {
			channel,
			breadcrumbEntityLabel: channelLabel,
			breadcrumbEntityHref: `/notifications/channels/${channel.id}/edit`
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			throw redirect(303, `/notifications/channels?error=${encodeURIComponent(error.message)}`);
		}
		throw error;
	}
};

export const actions: Actions = {
	update: async (event) => {
		const id = event.params.id;
		const formData = await event.request.formData();
		const name = String(formData.get('name') ?? '').trim();
		const appriseUrl = String(formData.get('apprise_url') ?? '').trim();
		if (!name) {
			return fail(400, { update_error: 'Name is required.' });
		}
		if (!appriseUrl) {
			return fail(400, { update_error: 'Apprise URL is required.' });
		}

		try {
			await callDashboardApi(event, `/api/v1/notification-channels/${id}`, {
				method: 'PATCH',
				body: { name, apprise_url: appriseUrl }
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { update_error: error.message });
			}
			throw error;
		}

		throw redirect(303, '/notifications/channels');
	}
};
