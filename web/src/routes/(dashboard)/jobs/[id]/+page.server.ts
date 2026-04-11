import type { PageServerLoad } from './$types';
import { callDashboardApi } from '$lib/server/dashboard-api';
import { toRouteId } from '$lib/server/record-id';

export const load: PageServerLoad = async (event) => {
	const data = await callDashboardApi<{ job: Record<string, unknown> }>(event, `/api/v1/jobs/${event.params.id}`);
	return { job: { ...data.job, id: toRouteId(data.job.id) } };
};
