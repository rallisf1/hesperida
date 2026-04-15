import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadJobQueueDiffData, loadTaskResultPayload } from '$lib/server/job-queue-diff';
import { DashboardApiError } from '$lib/server/dashboard-api';

export const load: PageServerLoad = async (event) => loadJobQueueDiffData(event);

export const actions: Actions = {
	compare: async (event) => {
		const formData = await event.request.formData();
		const rightId = String(formData.get('right_task_id') ?? '').trim();
		if (!rightId) {
			return fail(400, { compare_error: 'Right task id is required.' });
		}

		try {
			const payload = await loadTaskResultPayload(event, rightId);
			return { compare_payload: payload };
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { compare_error: error.message });
			}
			return fail(400, { compare_error: (error as Error).message });
		}
	}
};
