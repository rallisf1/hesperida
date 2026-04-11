import { redirect, type Handle } from '@sveltejs/kit';
import { config, getMissingRequiredEnv } from '$lib/server/config';
import { getAuthToken, getCurrentUser } from '$lib/server/auth';
import { checkAuthRateLimit } from '$lib/server/rate-limit';

const isAuthRoute = (pathname: string): boolean => pathname.startsWith('/api/v1/auth/');
const isApiRoute = (pathname: string): boolean => pathname.startsWith('/api/v1');
const isAuthPageRoute = (pathname: string): boolean => pathname.startsWith('/auth');
const isStaticAssetRoute = (pathname: string): boolean =>
	pathname.startsWith('/_app/') || pathname === '/favicon.ico' || pathname === '/robots.txt';
const isPublicDashboardRoute = (pathname: string): boolean =>
	isAuthPageRoute(pathname) || pathname === '/health' || isStaticAssetRoute(pathname);
let configValidated = false;

const jsonError = (requestId: string, status: number, code: string, message: string): Response => {
	return Response.json(
		{
			ok: false,
			request_id: requestId,
			error: { code, message }
		},
		{ status }
	);
};

export const handle: Handle = async ({ event, resolve }) => {
	if (!configValidated) {
		const missingEnv: string[] = getMissingRequiredEnv();
		if (missingEnv.length) {
			throw new Error(`Missing required environment variables for APP_MODE=${config.appMode}: ${missingEnv.join(', ')}`);
		}
		configValidated = true;
	}

	const started = Date.now();
	event.locals.requestId = crypto.randomUUID();
	event.locals.authToken = getAuthToken(event);

	const acceptLanguage = event.request.headers.get('accept-language');
	event.locals.locale = acceptLanguage ? acceptLanguage.split(/[,;]/)[0].trim() : 'en-US';

	const { pathname } = event.url;

	if (config.appMode === 'api' && !isApiRoute(pathname)) {
		return new Response('Not Found', { status: 404 });
	}

	if (config.appMode === 'dashboard' && isApiRoute(pathname)) {
		return new Response('Not Found', { status: 404 });
	}

	if (isApiRoute(pathname) && !isAuthRoute(pathname)) {
		const key = event.request.headers.get('x-api-key')?.trim() ?? '';
		if (!key || key !== config.webApiKey) {
			return jsonError(event.locals.requestId, 401, 'unauthorized', 'Missing or invalid x-api-key header.');
		}
	}

	if (isAuthRoute(pathname)) {
		const identity = `${event.getClientAddress()}:${pathname}`;
		const limit = checkAuthRateLimit(identity);
		if (!limit.allowed) {
			const response = jsonError(event.locals.requestId, 429, 'rate_limited', 'Too many authentication requests.');
			response.headers.set('retry-after', String(limit.retryAfterSec));
			return response;
		}
	}

	const isDashboardRequest = !isApiRoute(pathname);
	if (isDashboardRequest && !isPublicDashboardRoute(pathname)) {
		if (!event.locals.authToken) {
			throw redirect(303, '/auth/signin');
		}

		const user = await getCurrentUser(event.locals.authToken);
		if (!user) {
			event.cookies.delete(config.sessionCookieName, { path: '/' });
			throw redirect(303, '/auth/signin');
		}
		event.locals.user = user;
	}

	const response = await resolve(event);
	response.headers.set('x-request-id', event.locals.requestId);

	if (config.debug && isApiRoute(pathname)) {
		const elapsed = Date.now() - started;
		console.log(`[web-api] ${event.locals.requestId} ${event.request.method} ${pathname} -> ${response.status} (${elapsed}ms)`);
	}

	return response;
};
