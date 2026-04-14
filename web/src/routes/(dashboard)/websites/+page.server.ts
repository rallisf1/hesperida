import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { parseAllowedFilter } from '$lib/server/filter';
import type { ApiJob, ApiWebsite } from '$lib/types/api';
import { mapWebsiteToView, toRouteIdString } from '$lib/server/dashboard-mappers';
import { toRegistrableDomain } from 'rdapper';

export const load: PageServerLoad = async (event) => {
	const allowedFilters = ['all', 'verified', 'unverified'] as const;
	const initialFilter = parseAllowedFilter(event.url.searchParams.get('filter'), allowedFilters, 'all');

	try {
		const [websiteData, jobData] = await Promise.all([
			callDashboardApi<{ websites: ApiWebsite[] }>(event, '/api/v1/websites'),
			callDashboardApi<{ jobs: ApiJob[] }>(event, '/api/v1/jobs')
		]);
		const websiteJobCounts = (jobData.jobs ?? []).reduce<Record<string, number>>((acc, job) => {
			const websiteId = toRouteIdString(job.website);
			if (!websiteId) return acc;
			acc[websiteId] = (acc[websiteId] ?? 0) + 1;
			return acc;
		}, {});

		const websites = (websiteData.websites ?? []).map(mapWebsiteToView).map((website) => {
			let registrableDomain = '';
			try {
				const parsed = new URL(website.url ?? '');
				registrableDomain = toRegistrableDomain(parsed.hostname) ?? '';
			} catch {
				registrableDomain = '';
			}
			const txtHost = registrableDomain ? `hesperida.${registrableDomain}` : 'hesperida.<domain>';
			return { ...website, txt_host: txtHost };
		});

		return {
			websites,
			websiteJobCounts,
			initialFilter,
			error: null
		};
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return { websites: [], websiteJobCounts: {}, initialFilter, error: error.message };
		}
		throw error;
	}
};

export const actions: Actions = {
	verify: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) return fail(400, { verify_error: 'Website id is required.' });

		try {
			await callDashboardApi(event, `/api/v1/websites/${id}/verify`);
			return { verify_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { verify_error: error.message });
			}
			throw error;
		}
	},
	delete: async (event) => {
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '').trim();
		if (!id) return fail(400, { delete_error: 'Website id is required.' });

		try {
			await callDashboardApi<{ deleted: boolean }>(event, `/api/v1/websites/${id}`, {
				method: 'DELETE'
			});
			return { delete_success: true };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { delete_error: error.message });
			}
			throw error;
		}
	}
};
