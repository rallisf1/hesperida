import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { toRouteId } from '$lib/server/record-id';
import type { Job, User, Website } from '$lib/types';

type WebsiteJobRow = Omit<Job, 'id'> & {
	id: string;
};

export const load: PageServerLoad = async (event) => {
	const websiteData = await callDashboardApi<{ website: Website }>(
		event,
		`/api/v1/websites/${event.params.id}`
	);
	const memberData = await callDashboardApi<{ owner_user?: User | null; member_users?: User[] }>(
		event,
		`/api/v1/websites/${event.params.id}/members`
	);
	const jobsData = await callDashboardApi<{ jobs: Job[] }>(event, '/api/v1/jobs');
	const websiteRouteId = toRouteId(websiteData.website.id);
	const latestJobs: WebsiteJobRow[] = (jobsData.jobs ?? [])
		.filter((job) => toRouteId(job.website) === websiteRouteId)
		.slice(0, 10)
		.map((job) => ({ ...job, id: toRouteId(job.id) }));

	return {
		website: { ...websiteData.website, id: websiteRouteId },
		ownerUser: memberData.owner_user
			? { ...memberData.owner_user, id: toRouteId(memberData.owner_user.id) }
			: null,
		memberUsers: (memberData.member_users ?? []).map((member) => ({
			...member,
			id: toRouteId(member.id)
		})),
		latestJobs,
		currentUserRole: event.locals.user?.role ?? null,
		breadcrumbEntityLabel: websiteData.website.url?.trim() || `Website ${websiteRouteId}`,
		breadcrumbEntityHref: `/websites/${websiteRouteId}`
	};
};

export const actions: Actions = {
	invite: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '').trim();
		if (!email) return fail(400, { invite_error: 'email is required.' });

		try {
			await callDashboardApi(event, `/api/v1/websites/${event.params.id}/invite`, {
				method: 'POST',
				body: { email }
			});
			return { invite_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { invite_error: error.message });
			}
			throw error;
		}
	},
	uninvite: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '').trim();
		if (!email) return fail(400, { uninvite_error: 'email is required.' });

		try {
			await callDashboardApi(event, `/api/v1/websites/${event.params.id}/uninvite`, {
				method: 'POST',
				body: { email }
			});
			return { uninvite_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { uninvite_error: error.message });
			}
			throw error;
		}
	}
};
