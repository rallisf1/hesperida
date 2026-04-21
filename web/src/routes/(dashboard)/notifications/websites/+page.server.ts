import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapWebsiteNotificationToView } from '$lib/server/dashboard-mappers';
import type { ApiWebsiteNotification } from '$lib/types/api';
import { parseAllowedFilter } from '$lib/server/filter';

export const load: PageServerLoad = async (event) => {
	const urlError = event.url.searchParams.get('error')?.trim() || null;
	const allowedFilters = ['all', 'completed', 'failed'] as const;
	const initialFilter = parseAllowedFilter(event.url.searchParams.get('filter'), allowedFilters, 'all');
	try {
		const data = await callDashboardApi<{ links: ApiWebsiteNotification[] }>(
			event,
			'/api/v1/website-notifications'
		);

		return {
			links: (data.links ?? []).map(mapWebsiteNotificationToView),
			error: urlError,
			initialFilter
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return {
				links: [],
				error: urlError ?? error.message,
				initialFilter
			};
		}
		throw error;
	}
};

export const actions: Actions = {
	deleteLink: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) return fail(400, { link_error: 'Link ID is required.' });

		try {
			await callDashboardApi(event, `/api/v1/website-notifications/${id}`, { method: 'DELETE' });
			return { success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { link_error: error.message });
			}
			throw error;
		}
	}
};

