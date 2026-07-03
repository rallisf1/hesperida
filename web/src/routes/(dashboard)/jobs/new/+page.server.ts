import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import type { Tool } from '$lib/types';
import type { ApiWebsite } from '$lib/types/api';
import { mapWebsiteToView } from '$lib/server/dashboard-mappers';
import { getPlaywrightDevices } from '$lib/server/playwright-devices';

export const load: PageServerLoad = async (event) => {
	const rawPrefillWebsiteId = String(event.url.searchParams.get('website_id') ?? '').trim();
	const prefillWebsiteId = rawPrefillWebsiteId.includes(':')
		? rawPrefillWebsiteId.split(':').pop() ?? ''
		: rawPrefillWebsiteId;
	const devices = await getPlaywrightDevices();

	const websitesData = await callDashboardApi<{ websites: ApiWebsite[] }>(event, '/api/v1/websites');
	return {
		websites: (websitesData.websites ?? []).map(mapWebsiteToView),
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
		const scheduleEnabled = formData.get('schedule_enabled') !== null;
		const scheduleCron = String(formData.get('schedule_cron') ?? '').trim();
		const seoCrawlEnabled = formData.get('seo_crawl_enabled') !== null;
		const seoMaxPages = Number.parseInt(String(formData.get('seo_max_pages') ?? '10'), 10);
		const seoConcurrency = Number.parseInt(String(formData.get('seo_concurrency') ?? '3'), 10);
		const wcagCrawlEnabled = formData.get('wcag_crawl_enabled') !== null;
		const wcagMaxPages = Number.parseInt(String(formData.get('wcag_max_pages') ?? '12'), 10);
		const wcagMaxDepth = Number.parseInt(String(formData.get('wcag_max_depth') ?? '2'), 10);
		const wcagUrlMode = String(formData.get('wcag_url_mode') ?? 'representative').trim();
		const securityScope = String(formData.get('security_scope') ?? 'root').trim();
		const nucleiDiscovery = String(formData.get('nuclei_discovery') ?? 'none').trim();

		if (!website) {
			return fail(400, { error: 'website is required.', values: { website, types: selectedTools, devices: selectedDevices } });
		}

		const options: any = {};
		if (selectedTools.includes('wcag')) {
			options.wcag = {
				devices: selectedDevices,
				crawl: {
					enabled: wcagCrawlEnabled,
					maxPages: Number.isFinite(wcagMaxPages) && wcagMaxPages > 0 ? wcagMaxPages : 12,
					maxDepth: Number.isFinite(wcagMaxDepth) && wcagMaxDepth > 0 ? wcagMaxDepth : 2
				},
				urls: {
					mode: ['representative', 'selected', 'manual'].includes(wcagUrlMode) ? wcagUrlMode : 'representative'
				}
			};
		}
		if (selectedTools.includes('seo')) {
			options.seo = {
				crawl: {
					enabled: seoCrawlEnabled,
					maxPages: Number.isFinite(seoMaxPages) && seoMaxPages > 0 ? seoMaxPages : 10,
					concurrency: Number.isFinite(seoConcurrency) && seoConcurrency > 0 ? seoConcurrency : 3
				}
			};
		}
		if (selectedTools.includes('security')) {
			options.security = {
				scope: securityScope === 'domain' ? 'domain' : 'root',
				nuclei: {
					discovery: ['none', 'katana', 'selected_urls'].includes(nucleiDiscovery) ? nucleiDiscovery : 'none'
				}
			};
		}

		try {
			await callDashboardApi(event, '/api/v1/jobs', {
				method: 'POST',
				body: {
					website,
					types: selectedTools,
					...(Object.keys(options).length ? { options } : {}),
					...(scheduleEnabled ? { schedule: { enabled: true, cron: scheduleCron } } : {})
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
