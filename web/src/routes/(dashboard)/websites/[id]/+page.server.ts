import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { toRouteId } from '$lib/server/record-id';
import type { User, Website } from '$lib/types';

export const load: PageServerLoad = async (event) => {
	const data = await callDashboardApi<{ website: Website; owner_user?: User | null; member_users?: User[] }>(
		event,
		`/api/v1/websites/${event.params.id}`
	);
	return {
		website: { ...data.website, id: toRouteId(data.website.id) },
		ownerUser: data.owner_user
			? { ...data.owner_user, id: toRouteId(data.owner_user.id) }
			: null,
		memberUsers: (data.member_users ?? []).map((member) => ({
			...member,
			id: toRouteId(member.id)
		})),
		currentUserRole: event.locals.user?.role ?? null
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
