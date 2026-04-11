import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';

export const load: PageServerLoad = async (event) => {
	return {
		currentUserRole: event.locals.user?.role ?? null
	};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const name = String(formData.get('name') ?? '').trim();
		const email = String(formData.get('email') ?? '').trim();
		const role = String(formData.get('role') ?? '').trim();

		if (!name || !email || !role) {
			return fail(400, { error: 'name, email and role are required.', values: { name, email, role } });
		}

		try {
			await callDashboardApi<{ user: { id: string } }>(event, '/api/v1/users', {
				method: 'POST',
				body: { name, email, role }
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { error: error.message, values: { name, email, role } });
			}
			throw error;
		}

		throw redirect(303, '/users');
	}
};

