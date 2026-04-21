export type AppriseClientConfig = {
	baseUrl: string;
	apiKey?: string;
};

export type AppriseNotifyInput = {
	targets: string[];
	title: string;
	body: string;
	format: 'text' | 'markdown' | 'html';
};

const APPRISE_STATUS_OK = new Set(['ok', 'success', 'queued']);

export const sendAppriseNotification = async (
	config: AppriseClientConfig,
	input: AppriseNotifyInput
): Promise<void> => {
	if (!config.baseUrl?.trim()) {
		throw new Error('APPRISE_URL is not configured.');
	}

	const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/notify`;
	const headers = new Headers({
		'content-type': 'application/json',
		accept: 'application/json'
	});

	if (config.apiKey?.trim()) {
		headers.set('x-api-key', config.apiKey.trim());
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

	if (response.status >= 300) {
		throw new Error(`Apprise returned HTTP ${response.status}`);
	}

	let payload: Record<string, unknown> | null = null;
	try {
		payload = (await response.json()) as Record<string, unknown>;
	} catch {
		payload = null;
	}

	const status = String(payload?.status ?? '').toLowerCase();
	if (status && !APPRISE_STATUS_OK.has(status)) {
		throw new Error(`Apprise notify failed with status: ${status}`);
	}
};

