import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { parseAllowedFilter } from '$lib/server/filter';
import type { Website } from '$lib/types';

export const load: PageServerLoad = async (event) => {
	const allowedFilters = ['all', 'verified', 'unverified'] as const;
	const initialFilter = parseAllowedFilter(event.url.searchParams.get('filter'), allowedFilters, 'all');

	try {
		const data = await callDashboardApi<{ websites: Website[] }>(event, '/api/v1/websites');
		return {
			websites: data.websites ?? [],
			initialFilter,
			error: null
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return { websites: [], initialFilter, error: error.message };
		}
		throw error;
	}
};

export const actions: Actions = {
	delete: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) return fail(400, { delete_error: 'Website id is required.' });

		try {
			await callDashboardApi<{ deleted: boolean }>(event, `/api/v1/websites/${id}`, {
				method: 'DELETE'
			});
			return { delete_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { delete_error: error.message });
			}
			throw error;
		}
	}
};
