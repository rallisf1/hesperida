import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { toRouteId } from '$lib/server/record-id';

export const load: PageServerLoad = async (event) => {
	const data = await callDashboardApi<{ task: Record<string, unknown> }>(event, `/api/v1/job-queue/${event.params.id}`);
	return { task: { ...data.task, id: toRouteId(data.task.id) } };
};

export const actions: Actions = {
	cancel: async (event) => {
		try {
			await callDashboardApi(event, `/api/v1/job-queue/${event.params.id}/cancel`, {
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
