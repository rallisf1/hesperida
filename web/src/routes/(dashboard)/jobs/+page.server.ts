import type { PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { toRouteId } from '$lib/server/record-id';
import { parseAllowedFilter } from '$lib/server/filter';
import type { Job } from '$lib/types';

export const load: PageServerLoad = async (event) => {
	const allowedFilters = ['all', 'pending', 'processing', 'completed', 'failed'] as const;
	const initialFilter = parseAllowedFilter(event.url.searchParams.get('filter'), allowedFilters, 'all');

	try {
		const data = await callDashboardApi<{ jobs: Job[] }>(event, '/api/v1/jobs');
		return {
			jobs: (data.jobs ?? []).map((job) => ({
				...job,
				id: toRouteId(job.id)
			})),
			initialFilter,
			error: null
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return { jobs: [], initialFilter, error: error.message };
		}
		throw error;
	}
};
