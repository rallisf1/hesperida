import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { mapUserToView, toRouteIdString } from '$lib/server/dashboard-mappers';
import type { ApiUser } from '$lib/types/api';

export const load: PageServerLoad = async (event) => {
	const data = await callDashboardApi<{ user: ApiUser }>(event, `/api/v1/users/${event.params.id}`);
	const user = mapUserToView(data.user);
	const userRouteId = user.id;
	const currentUserRouteId = toRouteIdString(event.locals.user?.id ?? '');
	const currentUserIsSuperuser = event.locals.user?.is_superuser === true;
	const canEditGroup =
		currentUserIsSuperuser && currentUserRouteId !== userRouteId && !Boolean(data.user.is_superuser);
	return {
		user,
		currentUserRole: event.locals.user?.role ?? null,
		canEditGroup,
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
		const submittedGroup = String(formData.get('group') ?? '').trim();

		let isTargetSuperuser = false;
		let currentUserGroup = '';
		try {
			const current = await callDashboardApi<{ user: ApiUser }>(
				event,
				`/api/v1/users/${event.params.id}`
			);
			isTargetSuperuser = Boolean(current.user.is_superuser);
			currentUserGroup = current.user.group;
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, {
					error: error.message,
					values: { name, email, role: submittedRole, group: submittedGroup }
				});
			}
			throw error;
		}
		const role = isTargetSuperuser ? 'admin' : submittedRole;
		const currentUserRouteId = toRouteIdString(event.locals.user?.id ?? '');
		const currentUserIsSuperuser = event.locals.user?.is_superuser === true;
		const canEditGroup =
			currentUserIsSuperuser &&
			currentUserRouteId !== event.params.id &&
			!isTargetSuperuser;

		if (!name || !email || !role) {
			return fail(400, {
				error: 'name, email and role are required.',
				values: { name, email, role, group: submittedGroup }
			});
		}

		try {
			const body: { name: string; email: string; role: string; group?: string } = { name, email, role };
			body.group = canEditGroup ? submittedGroup : currentUserGroup;
			await callDashboardApi<{ user: ApiUser }>(event, `/api/v1/users/${event.params.id}`, {
				method: 'PATCH',
				body
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, {
					error: error.message,
					values: { name, email, role, group: submittedGroup }
				});
			}
			throw error;
		}

		throw redirect(303, `/users/${event.params.id}`);
	}
};
