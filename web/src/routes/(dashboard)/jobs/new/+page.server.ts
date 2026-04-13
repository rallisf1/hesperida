import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import type { Tool, Website } from '$lib/types';

interface Device {
	name: string;
	resolution: string;
	isMobile: boolean;
}

export const load: PageServerLoad = async (event) => {
	const rawPrefillWebsiteId = String(event.url.searchParams.get('website_id') ?? '').trim();
	const prefillWebsiteId = rawPrefillWebsiteId.includes(':')
		? rawPrefillWebsiteId.split(':').pop() ?? ''
		: rawPrefillWebsiteId;
	const devicesRes = await event.fetch('https://raw.githubusercontent.com/microsoft/playwright/refs/heads/main/packages/playwright-core/src/server/deviceDescriptorsSource.json');
	const devicesRaw = await devicesRes.json();

	const devices: Device[] = [];
	for (const [key, value] of Object.entries(devicesRaw)) {
		devices.push({
			name: key,
			//@ts-ignore
			resolution: value.viewport.width + 'x' + value.viewport.height,
			//@ts-ignore
			isMobile: value.isMobile
		})
	}

	const websitesData = await callDashboardApi<{ websites: Website[] }>(event, '/api/v1/websites');
	return {
		websites: websitesData.websites ?? [],
		devices,
		prefillWebsiteId
	};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const website = String(formData.get('website') ?? '').trim();
		const selectedTools = formData.getAll('types').map((v) => String(v).trim()) as Tool[];
		const selectedDevices = formData.getAll('devices').map((v) => String(v).trim());

		if (!website) {
			return fail(400, { error: 'website is required.', values: { website, types: selectedTools, devices: selectedDevices } });
		}

		const options: any = {};
		options.wcag = {};
		options.wcag.devices = selectedDevices;

		try {
			await callDashboardApi(event, '/api/v1/jobs', {
				method: 'POST',
				body: {
					website,
					types: selectedTools,
					...(options ? { options } : {})
				}
			});
		} catch (error) {
			if (error instanceof DashboardApiError) {
				return fail(error.status, { error: error.message , values: { website, types: selectedTools, devices: selectedDevices } });
			}
			throw error;
		}

		throw redirect(303, '/jobs');
	}
};
