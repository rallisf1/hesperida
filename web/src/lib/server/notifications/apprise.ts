import { config } from '$lib/server/config';

export type AppriseNotifyInput = {
	targets: string[];
	title: string;
	body: string;
	format: 'text' | 'markdown' | 'html';
};

const APPRISE_STATUS_OK = new Set(['ok', 'success', 'queued']);

export const sendAppriseNotification = async (input: AppriseNotifyInput): Promise<void> => {
	if (!config.appriseUrl) {
		throw new Error('APPRISE_URL is not configured.');
	}

	const endpoint = `${config.appriseUrl.replace(/\/+$/, '')}/notify`;
	const headers = new Headers({
		'content-type': 'application/json'
	});

	if (config.appriseApiKey) {
		headers.set('x-api-key', config.appriseApiKey);
	}

	const response = await fetch(endpoint, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			title: input.title,
			body: input.body,
			urls: input.targets,
			format: input.format,
			type: 'info'
		})
	});

	let payload: Record<string, unknown> | null = null;
	try {
		payload = (await response.json()) as Record<string, unknown>;
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const errorMessage =
			typeof payload?.error === 'string'
				? payload.error
				: typeof payload?.message === 'string'
					? payload.message
					: `Apprise returned HTTP ${response.status}`;
		throw new Error(errorMessage);
	}

	const status = String(payload?.status ?? '').toLowerCase();
	if (status && !APPRISE_STATUS_OK.has(status)) {
		throw new Error(`Apprise notify failed with status: ${status}`);
	}
};
