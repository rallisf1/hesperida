import { handle } from '../../hooks.server';

import * as authSignup from '../../routes/api/v1/auth/signup/+server';
import * as authSignin from '../../routes/api/v1/auth/signin/+server';
import * as authSignout from '../../routes/api/v1/auth/signout/+server';
import * as authMe from '../../routes/api/v1/auth/me/+server';
import * as authForgot from '../../routes/api/v1/auth/forgot/+server';

import * as websites from '../../routes/api/v1/websites/+server';
import * as websiteById from '../../routes/api/v1/websites/[id]/+server';
import * as websiteMembers from '../../routes/api/v1/websites/[id]/members/+server';
import * as websiteInvite from '../../routes/api/v1/websites/[id]/invite/+server';
import * as websiteUninvite from '../../routes/api/v1/websites/[id]/uninvite/+server';
import * as websiteTransferOwnership from '../../routes/api/v1/websites/[id]/transfer-ownership/+server';
import * as websiteVerify from '../../routes/api/v1/websites/[id]/verify/+server';

import * as jobs from '../../routes/api/v1/jobs/+server';
import * as jobById from '../../routes/api/v1/jobs/[id]/+server';
import * as jobQueueByJob from '../../routes/api/v1/jobs/[id]/queue/+server';

import * as queue from '../../routes/api/v1/job-queue/+server';
import * as queueById from '../../routes/api/v1/job-queue/[id]/+server';
import * as schedules from '../../routes/api/v1/schedule/+server';
import * as scheduleById from '../../routes/api/v1/schedule/[id]/+server';

import * as resultsByJob from '../../routes/api/v1/results/jobs/[id]/+server';
import * as resultsByTool from '../../routes/api/v1/results/jobs/[id]/[tool]/+server';
import * as userMe from '../../routes/api/v1/users/me/+server';
import * as notificationChannels from '../../routes/api/v1/notification-channels/+server';
import * as notificationChannelById from '../../routes/api/v1/notification-channels/[id]/+server';
import * as notificationChannelTest from '../../routes/api/v1/notification-channels/[id]/test/+server';
import * as websiteNotifications from '../../routes/api/v1/website-notifications/+server';
import * as websiteNotificationById from '../../routes/api/v1/website-notifications/[id]/+server';

type HandlerModule = {
	GET?: (event: any) => Response | Promise<Response>;
	POST?: (event: any) => Response | Promise<Response>;
	PATCH?: (event: any) => Response | Promise<Response>;
	DELETE?: (event: any) => Response | Promise<Response>;
};

type RouteEntry = {
	regex: RegExp;
	module: HandlerModule;
};

const routes: RouteEntry[] = [
	{ regex: /^\/api\/v1\/auth\/signup$/, module: authSignup },
	{ regex: /^\/api\/v1\/auth\/signin$/, module: authSignin },
	{ regex: /^\/api\/v1\/auth\/signout$/, module: authSignout },
	{ regex: /^\/api\/v1\/auth\/me$/, module: authMe },
	{ regex: /^\/api\/v1\/auth\/forgot$/, module: authForgot },
	{ regex: /^\/api\/v1\/users\/me$/, module: userMe },
	{ regex: /^\/api\/v1\/notification-channels$/, module: notificationChannels },
	{ regex: /^\/api\/v1\/notification-channels\/(?<id>[^/]+)\/test$/, module: notificationChannelTest },
	{ regex: /^\/api\/v1\/notification-channels\/(?<id>[^/]+)$/, module: notificationChannelById },
	{ regex: /^\/api\/v1\/website-notifications$/, module: websiteNotifications },
	{ regex: /^\/api\/v1\/website-notifications\/(?<id>[^/]+)$/, module: websiteNotificationById },
	{ regex: /^\/api\/v1\/websites$/, module: websites },
	{ regex: /^\/api\/v1\/websites\/(?<id>[^/]+)\/members$/, module: websiteMembers },
	{ regex: /^\/api\/v1\/websites\/(?<id>[^/]+)\/invite$/, module: websiteInvite },
	{ regex: /^\/api\/v1\/websites\/(?<id>[^/]+)\/uninvite$/, module: websiteUninvite },
	{ regex: /^\/api\/v1\/websites\/(?<id>[^/]+)\/transfer-ownership$/, module: websiteTransferOwnership },
	{ regex: /^\/api\/v1\/websites\/(?<id>[^/]+)\/verify$/, module: websiteVerify },
	{ regex: /^\/api\/v1\/websites\/(?<id>[^/]+)$/, module: websiteById },
	{ regex: /^\/api\/v1\/jobs$/, module: jobs },
	{ regex: /^\/api\/v1\/jobs\/(?<id>[^/]+)\/queue$/, module: jobQueueByJob },
	{ regex: /^\/api\/v1\/jobs\/(?<id>[^/]+)$/, module: jobById },
	{ regex: /^\/api\/v1\/job-queue$/, module: queue },
	{ regex: /^\/api\/v1\/job-queue\/(?<id>[^/]+)$/, module: queueById },
	{ regex: /^\/api\/v1\/schedule$/, module: schedules },
	{ regex: /^\/api\/v1\/schedule\/(?<id>[^/]+)$/, module: scheduleById },
	{ regex: /^\/api\/v1\/results\/jobs\/(?<id>[^/]+)\/(?<tool>[^/]+)$/, module: resultsByTool },
	{ regex: /^\/api\/v1\/results\/jobs\/(?<id>[^/]+)$/, module: resultsByJob }
];

class CookieState {
	public readonly values = new Map<string, string>();
	private readonly setCookieHeaders: string[] = [];

	constructor(seed?: Record<string, string>) {
		for (const [key, value] of Object.entries(seed ?? {})) {
			this.values.set(key, value);
		}
	}

	public get(name: string): string | undefined {
		return this.values.get(name);
	}

	public set(name: string, value: string, options?: Record<string, unknown>) {
		this.values.set(name, value);
		this.setCookieHeaders.push(this.serialize(name, value, options));
	}

	public delete(name: string, options?: Record<string, unknown>) {
		this.values.delete(name);
		this.setCookieHeaders.push(this.serialize(name, '', { ...(options ?? {}), maxAge: 0 }));
	}

	public appendTo(response: Response): void {
		for (const line of this.setCookieHeaders) {
			response.headers.append('set-cookie', line);
		}
	}

	public clearPending(): void {
		this.setCookieHeaders.length = 0;
	}

	public header(): string {
		return [...this.values.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
	}

	private serialize(name: string, value: string, options?: Record<string, unknown>): string {
		const attrs: string[] = [];
		const path = typeof options?.path === 'string' ? options.path : '/';
		attrs.push(`Path=${path}`);

		if (options?.httpOnly) attrs.push('HttpOnly');
		if (options?.secure) attrs.push('Secure');
		if (typeof options?.sameSite === 'string') attrs.push(`SameSite=${options.sameSite}`);
		if (typeof options?.maxAge === 'number') attrs.push(`Max-Age=${options.maxAge}`);
		return `${name}=${value}; ${attrs.join('; ')}`;
	}
}

export type ApiCallOptions = {
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	path: string;
	body?: unknown;
	headers?: Record<string, string>;
	clientAddress?: string;
};

export class ApiTestClient {
	private readonly cookies: CookieState;
	private apiKey: string | null;
	private bearerToken: string | null;

	constructor(options?: { apiKey?: string | null; bearerToken?: string | null; cookies?: Record<string, string> }) {
		this.cookies = new CookieState(options?.cookies);
		this.apiKey =
			typeof options?.apiKey === 'undefined'
				? (process.env.WEB_API_KEY ?? 'test-web-api-key')
				: options.apiKey;
		this.bearerToken = typeof options?.bearerToken === 'undefined' ? null : options.bearerToken;
	}

	public setApiKey(key: string | null): void {
		this.apiKey = key;
	}

	public setBearerToken(token: string | null): void {
		this.bearerToken = token;
	}

	public getCookie(name: string): string | undefined {
		return this.cookies.get(name);
	}

	public async call(options: ApiCallOptions): Promise<{ response: Response; json: any }> {
		const method = options.method ?? 'GET';
		const url = new URL(`http://local.test${options.path}`);
		const headers = buildHeaders({
			path: options.path,
			headers: options.headers,
			body: options.body,
			cookieHeader: this.cookies.header(),
			apiKey: this.apiKey,
			bearerToken: this.bearerToken
		});

		const request = new Request(url, {
			method,
			headers,
			body: options.body === undefined ? undefined : JSON.stringify(options.body)
		});

		const route = matchRoute(url.pathname);
		const response = await handle({
			event: createTestEvent({
				url,
				request,
				cookies: this.cookies,
				params: route?.params ?? {},
				routeId: route?.id ?? null,
				clientAddress: options.clientAddress
			}),
			resolve: async (event: any) => {
				if (!route?.module) return new Response('Not Found', { status: 404 });
				const handler = route.module[method];
				if (!handler) return new Response('Method Not Allowed', { status: 405 });
				const res = await handler(event);
				this.cookies.appendTo(res);
				this.cookies.clearPending();
				return res;
			}
		} as any);

		return { response, json: await parseJsonResponse(response) };
	}
}

type BuildHeadersOptions = {
	path: string;
	headers?: Record<string, string>;
	body?: unknown;
	cookieHeader: string;
	apiKey: string | null;
	bearerToken: string | null;
};

const buildHeaders = (options: BuildHeadersOptions): Headers => {
	const headers = new Headers(options.headers ?? {});
	if (options.apiKey && !headers.has('x-api-key') && !options.path.startsWith('/api/v1/auth/')) {
		headers.set('x-api-key', options.apiKey);
	}
	if (options.bearerToken && !headers.has('authorization')) {
		headers.set('authorization', `Bearer ${options.bearerToken}`);
	}
	if (options.cookieHeader) {
		headers.set('cookie', options.cookieHeader);
	}
	if (options.body !== undefined && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}
	return headers;
};

type CreateTestEventOptions = {
	url: URL;
	request: Request;
	cookies: CookieState;
	params: Record<string, string>;
	routeId: string | null;
	clientAddress?: string;
};

const createTestEvent = (options: CreateTestEventOptions) => {
	return {
		url: options.url,
		request: options.request,
		locals: {
			requestId: '',
			authToken: null
		},
		params: options.params,
		cookies: {
			get: (name: string) => options.cookies.get(name),
			set: (name: string, value: string, opts?: Record<string, unknown>) =>
				options.cookies.set(name, value, opts),
			delete: (name: string, opts?: Record<string, unknown>) => options.cookies.delete(name, opts)
		},
		getClientAddress: () => options.clientAddress ?? '127.0.0.1',
		fetch: globalThis.fetch,
		platform: undefined,
		route: { id: options.routeId },
		setHeaders: () => undefined,
		isDataRequest: false,
		isSubRequest: false
	};
};

const parseJsonResponse = async (response: Response): Promise<any> => {
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		return response.json();
	}
	return null;
};

const matchRoute = (pathname: string): { module: HandlerModule; params: Record<string, string>; id: string } | null => {
	for (const entry of routes) {
		const matched = pathname.match(entry.regex);
		if (!matched) continue;
		return {
			module: entry.module,
			params: matched.groups ?? {},
			id: pathname
		};
	}
	return null;
};

export const randomEmail = (prefix = 'user'): string => {
	const normalizedPrefix =
		prefix
			.toLowerCase()
			.replace(/[^a-z0-9_]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'user';
	const part = Math.random().toString(36).slice(2, 10);
	const run = process.env.TEST_RUN_ID ?? 'run';
	return `${normalizedPrefix}_${run}_${part}@example.test`;
};
