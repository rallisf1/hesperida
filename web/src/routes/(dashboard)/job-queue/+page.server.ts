import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { toRouteId } from '$lib/server/record-id';
import { parseAllowedFilter } from '$lib/server/filter';
import type { Queue, Tool } from '$lib/types';

export const load: PageServerLoad = async (event) => {
	const rawFilter = event.url.searchParams.get('filter');

	try {
		const data = await callDashboardApi<{ tasks: Queue[] }>(event, '/api/v1/job-queue');
		const normalizedTasks = (data.tasks ?? []).map((task) => ({
			...task,
			id: toRouteId(task.id)
		}));
		const dynamicAllowed = ['all', ...Array.from(new Set(normalizedTasks.map((task) => task.type).filter((type): type is Tool => typeof type === 'string' && type.length > 0)))] as const;
		const initialFilter = parseAllowedFilter(rawFilter, dynamicAllowed, 'all');

		return {
			tasks: normalizedTasks,
			initialFilter,
			error: null
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return { tasks: [], initialFilter: 'all', error: error.message };
		}
		throw error;
	}
};

export const actions: Actions = {
	cancel: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) return fail(400, { cancel_error: 'Task id is required.' });

		try {
			await callDashboardApi(event, `/api/v1/job-queue/${id}/cancel`, {
				method: 'POST'
			});
			return { cancel_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { cancel_error: error.message });
			}
			throw error;
		}
	}
};
