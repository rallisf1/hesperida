import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapJobToView, mapScheduleToView } from '$lib/server/dashboard-mappers';
import type { ApiJob, ApiSchedule } from '$lib/types/api';

export const load: PageServerLoad = async (event) => {
	const scheduleData = await callDashboardApi<{ schedule: ApiSchedule }>(
		event,
		`/api/v1/schedule/${event.params.id}`
	);

	const schedule = mapScheduleToView(scheduleData.schedule);
	let linkedJob = null;

	try {
		const linkedJobData = await callDashboardApi<{ job: ApiJob }>(
			event,
			`/api/v1/jobs/${schedule.job_id}`
		);
		linkedJob = mapJobToView(linkedJobData.job);
	} catch (error) {
		if (!(error instanceof DashboardApiError)) throw error;
	}

	return {
		schedule,
		linkedJob,
		canManage: event.locals.user?.role !== 'viewer',
		breadcrumbEntityLabel: `Schedule ${schedule.id}`,
		breadcrumbEntityHref: `/schedule/${schedule.id}`
	};
};

export const actions: Actions = {
	delete: async (event) => {
		try {
			await callDashboardApi(event, `/api/v1/schedule/${event.params.id}`, {
				method: 'DELETE'
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { delete_error: error.message });
			}
			throw error;
		}

		throw redirect(303, '/schedule');
	}
};
