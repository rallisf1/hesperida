import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapScheduleToView } from '$lib/server/dashboard-mappers';
import { parseAllowedFilter } from '$lib/server/filter';
import type { ApiSchedule } from '$lib/types/api';

export const load: PageServerLoad = async (event) => {
	const allowedFilters = ['all', 'enabled', 'disabled'] as const;
	const initialFilter = parseAllowedFilter(event.url.searchParams.get('filter'), allowedFilters, 'all');
	const canManage = event.locals.user?.role !== 'viewer';
	const websiteFilter = event.url.searchParams.get('website');
	const jobFilter = event.url.searchParams.get('job');
	const scheduleQuery = new URLSearchParams();
	if (websiteFilter) scheduleQuery.set('website', websiteFilter);
	if (jobFilter) scheduleQuery.set('job', jobFilter);

	try {
		const scheduleData = await callDashboardApi<{ schedules: ApiSchedule[] }>(event, '/api/v1/schedule', {
			searchParams: scheduleQuery
		});

		return {
			schedules: (scheduleData.schedules ?? []).map(mapScheduleToView),
			initialFilter,
			canManage,
			websiteFilter,
			jobFilter,
			serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
			error: null
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return {
				schedules: [],
				initialFilter,
				canManage,
				websiteFilter,
				jobFilter,
				serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
				error: error.message
			};
		}
		throw error;
	}
};

export const actions: Actions = {
	delete: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) {
			return fail(400, { delete_error: 'Schedule ID is required.' });
		}

		try {
			await callDashboardApi(event, `/api/v1/schedule/${id}`, {
				method: 'DELETE'
			});
			return { success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { delete_error: error.message });
			}
			throw error;
		}
	}
};
