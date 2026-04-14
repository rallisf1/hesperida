import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { parseAllowedFilter } from '$lib/server/filter';
import type { ApiUser } from '$lib/types/api';
import { mapUserToView, toRouteIdString } from '$lib/server/dashboard-mappers';

const parsePositive = (value: string | null): number | null => {
	if (!value) return null;
	if (!/^\d+$/.test(value)) return null;
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : null;
};

export const load: PageServerLoad = async (event) => {
	const allowedFilters = ['all', 'admin', 'editor', 'viewer'] as const;
	const initialFilter = parseAllowedFilter(event.url.searchParams.get('filter'), allowedFilters, 'all');
	const isSuperuser = event.locals.user?.is_superuser === true;

	const page = parsePositive(event.url.searchParams.get('page'));
	const pageSize = parsePositive(event.url.searchParams.get('page_size'));
	const search = new URLSearchParams();
	if (page && pageSize) {
		search.set('page', String(page));
		search.set('page_size', String(pageSize));
	}

	try {
		const data = await callDashboardApi<{ users: ApiUser[]; page?: number; page_size?: number; total_items?: number }>(
			event,
			'/api/v1/users',
			{ searchParams: search }
		);
		const users = (data.users ?? []).map(mapUserToView).map((user) =>
			isSuperuser
				? user
				: {
						...user,
						group: '',
						is_superuser: false
					}
		);
		return {
			users,
			isSuperuser,
			currentUserId: toRouteIdString(event.locals.user?.id ?? ''),
			initialFilter,
			page: data.page ?? null,
			page_size: data.page_size ?? null,
			total_items: data.total_items ?? null,
			error: null
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return {
				users: [],
				isSuperuser,
				currentUserId: toRouteIdString(event.locals.user?.id ?? ''),
				initialFilter,
				page: null,
				page_size: null,
				total_items: null,
				error: error.message
			};
		}
		throw error;
	}
};

export const actions: Actions = {
	delete: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) {
			return fail(400, { delete_error: 'User id is required.' });
		}

		try {
			await callDashboardApi<{ deleted: boolean }>(event, `/api/v1/users/${id}`, {
				method: 'DELETE'
			});
			return { delete_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { delete_error: error.message });
			}
			throw error;
		}
	},
	reset_password: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '').trim();
		if (!email) {
			return fail(400, { reset_error: 'User email is required.' });
		}

		try {
			await callDashboardApi<{ success: boolean }>(event, '/api/v1/auth/forgot', {
				method: 'POST',
				body: { email }
			});
			return { reset_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { reset_error: error.message });
			}
			throw error;
		}
	}
};
