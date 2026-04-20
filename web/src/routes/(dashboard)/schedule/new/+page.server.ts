import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapJobToView, toRouteIdString } from '$lib/server/dashboard-mappers';
import type { ApiJob, ApiSchedule, ApiWebsite } from '$lib/types/api';

const WEBSITE_QUERY_PARAM = 'website_id';

export const load: PageServerLoad = async (event) => {
	const [jobsData, websitesData] = await Promise.all([
		callDashboardApi<{ jobs: ApiJob[] }>(event, '/api/v1/jobs'),
		callDashboardApi<{ websites: ApiWebsite[] }>(event, '/api/v1/websites')
	]);

	const websitesById = new Map<string, string>(
		(websitesData.websites ?? []).map((website) => [
			toRouteIdString(website.id),
			website.url ?? ''
		])
	);

	const completedJobs = (jobsData.jobs ?? [])
		.filter((job) => String(job.status ?? '') === 'completed')
		.map((job) => ({
			...mapJobToView(job),
			website_url: websitesById.get(toRouteIdString(job.website)) ?? ''
		}));

	const queryWebsiteId = event.url.searchParams.get(WEBSITE_QUERY_PARAM);
	const initialWebsiteId = queryWebsiteId ? toRouteIdString(queryWebsiteId) : '';
	const hasInitialWebsite = completedJobs.some((job) => job.website_id === initialWebsiteId);

	return {
		jobs: completedJobs,
		initialWebsiteId: hasInitialWebsite ? initialWebsiteId : '',
		canManage: event.locals.user?.role !== 'viewer'
	};
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const job = String(formData.get('job') ?? '').trim();
		const cron = String(formData.get('cron') ?? '').trim();
		const enabled = formData.get('enabled') !== null;

		if (!job || !cron) {
			return fail(400, { create_error: 'job and cron are required.' });
		}

		try {
			const data = await callDashboardApi<{ schedule: ApiSchedule }>(event, '/api/v1/schedule', {
				method: 'POST',
				body: { job, cron, enabled }
			});
			const scheduleId = toRouteIdString(data.schedule.id);
			throw redirect(303, `/schedule/${scheduleId}`);
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { create_error: error.message });
			}
			throw error;
		}
	}
};
