import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapJobToView, mapScheduleToView, toRouteIdString } from '$lib/server/dashboard-mappers';
import type { ApiJob, ApiSchedule, ApiWebsite } from '$lib/types/api';

export const load: PageServerLoad = async (event) => {
	const [scheduleData, jobsData, websitesData] = await Promise.all([
		callDashboardApi<{ schedule: ApiSchedule }>(event, `/api/v1/schedule/${event.params.id}`),
		callDashboardApi<{ jobs: ApiJob[] }>(event, '/api/v1/jobs'),
		callDashboardApi<{ websites: ApiWebsite[] }>(event, '/api/v1/websites')
	]);

	const schedule = mapScheduleToView(scheduleData.schedule);
	const scheduleLabel =
		`${schedule.website_url?.trim() ?? ''} [${schedule.cron}]`.trim().replace(/^:\s*/, '') ||
		`Schedule ${schedule.id}`;

	const websitesById = new Map<string, string>(
		(websitesData.websites ?? []).map((website) => [
			toRouteIdString(website.id),
			website.url ?? ''
		])
	);

	const allJobs = (jobsData.jobs ?? []).map((job) => ({
		...mapJobToView(job),
		website_url: websitesById.get(toRouteIdString(job.website)) ?? ''
	}));

	const eligibleJobs = allJobs.filter((job) => String(job.status ?? '') === 'completed' || job.id === schedule.job_id);

	return {
		schedule,
		jobs: eligibleJobs,
		initialWebsiteId: schedule.website_id ?? '',
		canManage: event.locals.user?.role !== 'viewer',
		breadcrumbEntityLabel: scheduleLabel,
		breadcrumbEntityHref: `/schedule/${schedule.id}`
	};
};

export const actions: Actions = {
	update: async (event) => {
		const formData = await event.request.formData();
		const job = String(formData.get('job') ?? '').trim();
		const cron = String(formData.get('cron') ?? '').trim();
		const enabled = formData.get('enabled') !== null;

		if (!job || !cron) {
			return fail(400, { update_error: 'job and cron are required.' });
		}

		try {
			await callDashboardApi(event, `/api/v1/schedule/${event.params.id}`, {
				method: 'PATCH',
				body: {
					job,
					cron,
					enabled
				}
			});
			throw redirect(303, `/schedule/${event.params.id}`);
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { update_error: error.message });
			}
			throw error;
		}
	}
};
