import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapJobToView, mapUserToView, mapWebsiteToView, toRouteIdString } from '$lib/server/dashboard-mappers';
import type { ApiJob, ApiUser, ApiWebsite } from '$lib/types/api';

type WebsiteJobRow = ReturnType<typeof mapJobToView> & {
	id: string;
};

export const load: PageServerLoad = async (event) => {
	const websiteData = await callDashboardApi<{ website: ApiWebsite }>(
		event,
		`/api/v1/websites/${event.params.id}`
	);
	const memberData = await callDashboardApi<{ owner_user?: ApiUser | null; member_users?: ApiUser[] }>(
		event,
		`/api/v1/websites/${event.params.id}/members`
	);
	const jobsData = await callDashboardApi<{ jobs: ApiJob[] }>(event, '/api/v1/jobs');
	const website = mapWebsiteToView(websiteData.website);
	const websiteRouteId = website.id;
	const currentUserId = toRouteIdString(event.locals.user?.id ?? '');
	const isOwner = currentUserId.length > 0 && currentUserId === website.owner_id;
	const latestJobs: WebsiteJobRow[] = (jobsData.jobs ?? [])
		.filter((job) => toRouteIdString(job.website) === websiteRouteId)
		.slice(0, 10)
		.map((job) => mapJobToView(job));

	return {
		website,
		ownerUser: memberData.owner_user
			? mapUserToView(memberData.owner_user)
			: null,
		memberUsers: (memberData.member_users ?? []).map(mapUserToView),
		latestJobs,
		isOwner,
		currentUserRole: event.locals.user?.role ?? null,
		breadcrumbEntityLabel: website.url?.trim() || `Website ${websiteRouteId}`,
		breadcrumbEntityHref: `/websites/${websiteRouteId}`
	};
};

export const actions: Actions = {
	invite: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '').trim();
		const role = String(formData.get('role') ?? '').trim().toLowerCase();
		if (!email || !role) return fail(400, { invite_error: 'email and role are required.' });

		try {
			await callDashboardApi(event, `/api/v1/websites/${event.params.id}/invite`, {
				method: 'POST',
				body: { email, role }
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
	},
	transfer_ownership: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '').trim();
		if (!email) return fail(400, { transfer_error: 'email is required.' });

		const keepPreviousOwnerAccess = formData.get('keep_previous_owner_access') !== null;

		try {
			await callDashboardApi(event, `/api/v1/websites/${event.params.id}/transfer-ownership`, {
				method: 'POST',
				body: {
					email,
					keep_previous_owner_access: keepPreviousOwnerAccess
				}
			});
			return { transfer_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { transfer_error: error.message });
			}
			throw error;
		}
	}
};
