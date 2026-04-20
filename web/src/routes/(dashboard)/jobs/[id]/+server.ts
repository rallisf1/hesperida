import type { RequestHandler } from './$types';
import { callDashboardApi, DashboardApiError } from '$lib/server/dashboard-api';
import { config } from '$lib/server/config';
import type { ApiJob } from '$lib/types/api';

const jsonError = (status: number, code: string, message: string): Response =>
	Response.json(
		{
			ok: false,
			error: { code, message }
		},
		{ status }
	);

export const POST: RequestHandler = async (event) => {
	let job: ApiJob | null = null;
	try {
		const data = await callDashboardApi<{ job: ApiJob }>(
			event,
			`/api/v1/jobs/${event.params.id}`
		);
		job = data.job;
	} catch (error) {
		if (error instanceof DashboardApiError) {
			return jsonError(error.status, error.code || 'job_fetch_failed', error.message);
		}
		return jsonError(500, 'job_fetch_failed', 'Could not load job details.');
	}

	if (!job) {
		return jsonError(404, 'not_found', 'Job not found.');
	}

	if (String(job.status ?? '').toLowerCase() !== 'completed') {
		return jsonError(
			409,
			'job_not_completed',
			'PDF report generation is only available for completed jobs.'
		);
	}

	const sourceUrl = `${event.url.origin}/jobs/${event.params.id}/pdf`;
	const body = new FormData();
	body.set('url', sourceUrl);
	body.set('paperWidth', '8.27');
	body.set('paperHeight', '11.7');

	let gotenbergResponse: Response;
	try {
		console.log(config.gotenbergUrl);
		gotenbergResponse = await fetch(
			`${config.gotenbergUrl.replace(/\/+$/, '')}/forms/chromium/convert/url`,
			{
				method: 'POST',
				body
			}
		);
	} catch {
		return jsonError(502, 'pdf_generation_failed', 'Could not reach PDF generation service.');
	}

	if (!gotenbergResponse.ok) {
		const details = (await gotenbergResponse.text()).trim();
		return jsonError(
			502,
			'pdf_generation_failed',
			details || 'PDF generation failed at the rendering service.'
		);
	}

	const headers = new Headers();
	headers.set('content-type', gotenbergResponse.headers.get('content-type') || 'application/pdf');
	headers.set(
		'content-disposition',
		`attachment; filename="hesperida-job-${event.params.id}.pdf"`
	);
	headers.set('cache-control', 'no-store');

	const contentLength = gotenbergResponse.headers.get('content-length');
	if (contentLength) {
		headers.set('content-length', contentLength);
	}

	if (!gotenbergResponse.body) {
		const bytes = await gotenbergResponse.arrayBuffer();
		return new Response(bytes, { status: 200, headers });
	}

	return new Response(gotenbergResponse.body, { status: 200, headers });
};
