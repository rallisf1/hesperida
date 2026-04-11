import type { RequestEvent } from '@sveltejs/kit';
import { config } from './config';

type ApiError = {
	code?: string;
	message?: string;
	details?: unknown;
};

type ApiEnvelope<T> =
	| { ok: true; data: T }
	| { ok: false; error?: ApiError };

export class DashboardApiError extends Error {
	status: number;
	code: string;
	details?: unknown;

	constructor(status: number, code: string, message: string, details?: unknown) {
		super(message);
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

type CallApiOptions = {
	method?: string;
	body?: Record<string, unknown>;
	searchParams?: URLSearchParams;
};

export const callDashboardApi = async <T>(
	event: RequestEvent,
	path: string,
	options: CallApiOptions = {}
): Promise<T> => {
	const url = options.searchParams && options.searchParams.toString().length > 0
		? `${path}?${options.searchParams.toString()}`
		: path;

	const headers: Record<string, string> = {
		'x-api-key': config.webApiKey
	};
	if (event.locals.authToken) {
		headers.authorization = `Bearer ${event.locals.authToken}`;
	}
	if (options.body) {
		headers['content-type'] = 'application/json';
	}

	const response = await event.fetch(url, {
		method: options.method ?? 'GET',
		headers,
		body: options.body ? JSON.stringify(options.body) : undefined
	});

	let payload: ApiEnvelope<T> | null = null;
	try {
		payload = (await response.json()) as ApiEnvelope<T>;
	} catch {
		payload = null;
	}

	if (!response.ok || !payload || !payload.ok) {
		const errorCode = payload && 'ok' in payload && !payload.ok ? (payload.error?.code ?? 'request_failed') : 'request_failed';
		const errorMessage =
			payload && 'ok' in payload && !payload.ok
				? (payload.error?.message ?? `Request failed with status ${response.status}`)
				: `Request failed with status ${response.status}`;
		const details = payload && 'ok' in payload && !payload.ok ? payload.error?.details : undefined;
		throw new DashboardApiError(response.status, errorCode, errorMessage, details);
	}

	return payload.data;
};

