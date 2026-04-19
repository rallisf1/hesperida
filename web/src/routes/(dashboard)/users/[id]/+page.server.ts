import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { normalizeRecordId } from '$lib/server/record-id';
import { mapUserToView, mapWebsiteToView, toRouteIdString } from '$lib/server/dashboard-mappers';
import type { ApiUser, ApiWebsite } from '$lib/types/api';

export const load: PageServerLoad = async (event) => {
	const data = await callDashboardApi<{ user: ApiUser }>(
		event,
		`/api/v1/users/${event.params.id}`
	);
	const websitesData = await callDashboardApi<{ websites: ApiWebsite[] }>(event, '/api/v1/websites');

	const isSuperuser = event.locals.user?.is_superuser === true;
	const currentUserRouteId = toRouteIdString(event.locals.user?.id ?? '');
	const user = mapUserToView(data.user);
	const visibleUser = isSuperuser
		? user
		: {
				...user,
				group: '',
				is_superuser: false
			};
	const userRecordId = normalizeRecordId(data.user.id);
	const userRouteId = visibleUser.id;
	const websites = (websitesData.websites ?? []).map((website) => {
		const ownerId = website.owner ? normalizeRecordId(website.owner) : '';
		const memberIds = Array.isArray(website.users)
			? website.users.map((member) => normalizeRecordId(member))
			: [];
		const isOwner = ownerId === userRecordId;
		const isMember = memberIds.includes(userRecordId) && !isOwner;
		return {
			...mapWebsiteToView(website),
			id: toRouteIdString(website.id),
			isOwner,
			isMember
		};
	});

	return {
		user: visibleUser,
		websites,
		isSuperuser,
		currentUserRole: event.locals.user?.role ?? null,
		canChangeGroup: isSuperuser && currentUserRouteId !== userRouteId && !visibleUser.is_superuser,
		breadcrumbEntityLabel: user.name?.trim() || user.email?.trim() || `User ${userRouteId}`,
		breadcrumbEntityHref: `/users/${userRouteId}`
	};
};

export const actions: Actions = {
	change_group: async (event) => {
		if (event.locals.user?.is_superuser !== true) {
			return fail(403, { change_group_error: 'Only superuser can change groups.' });
		}

		const currentUserRouteId = toRouteIdString(event.locals.user?.id ?? '');
		if (currentUserRouteId === event.params.id) {
			return fail(400, { change_group_error: 'You cannot change your own group.' });
		}

		const formData = await event.request.formData();
		const group = String(formData.get('group') ?? '').trim();
		if (!group) {
			return fail(400, { change_group_error: 'group is required.' });
		}

		try {
			await callDashboardApi<{ user: ApiUser }>(event, `/api/v1/users/${event.params.id}`, {
				method: 'PATCH',
				body: { group }
			});
			return { change_group_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { change_group_error: error.message });
			}
			throw error;
		}
	}
};
