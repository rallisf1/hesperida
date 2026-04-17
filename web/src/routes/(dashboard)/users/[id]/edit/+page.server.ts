import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapUserToView } from '$lib/server/dashboard-mappers';
import type { ApiUser } from '$lib/types/api';

export const load: PageServerLoad = async (event) => {
	const data = await callDashboardApi<{ user: ApiUser }>(event, `/api/v1/users/${event.params.id}`);
	const user = mapUserToView(data.user);
	const userRouteId = user.id;
	return {
		user,
		currentUserRole: event.locals.user?.role ?? null,
		breadcrumbEntityLabel: user.name?.trim() || user.email?.trim() || `User ${userRouteId}`,
		breadcrumbEntityHref: `/users/${userRouteId}`
	};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const name = String(formData.get('name') ?? '').trim();
		const email = String(formData.get('email') ?? '').trim();
		const submittedRole = String(formData.get('role') ?? '').trim();

		let isTargetSuperuser = false;
		try {
			const current = await callDashboardApi<{ user: ApiUser }>(
				event,
				`/api/v1/users/${event.params.id}`
			);
			isTargetSuperuser = Boolean(current.user.is_superuser);
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, {
					error: error.message,
					values: { name, email, role: submittedRole }
				});
			}
			throw error;
		}
		const role = isTargetSuperuser ? 'admin' : submittedRole;

		if (!name || !email || !role) {
			return fail(400, { error: 'name, email and role are required.', values: { name, email, role } });
		}

		try {
			await callDashboardApi<{ user: ApiUser }>(event, `/api/v1/users/${event.params.id}`, {
				method: 'PATCH',
				body: { name, email, role }
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { error: error.message, values: { name, email, role } });
			}
			throw error;
		}

		throw redirect(303, `/users/${event.params.id}`);
	}
};
