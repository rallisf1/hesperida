import type { RequestHandler } from './$types';
import { config } from '$lib/server/config';

export const POST: RequestHandler = async (event) => {
	const headers: Record<string, string> = {
		'x-api-key': config.webApiKey
	};
	if (event.locals.authToken) {
		headers.authorization = `Bearer ${event.locals.authToken}`;
	}

	const response = await event.fetch(`/api/v1/job-queue/${event.params.id}/cancel`, {
		method: 'POST',
		headers
	});

	const body = await response.text();
	return new Response(body, {
		status: response.status,
		headers: {
			'content-type': response.headers.get('content-type') ?? 'application/json',
		},
	});
};
