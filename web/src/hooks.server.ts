import { redirect, type Handle } from '@sveltejs/kit';
import { config, getMissingRequiredEnv } from '$lib/server/config';
import {
	clearSessionCookies,
	extractBearerToken,
	getAuthToken,
	getCurrentUserStatus,
	refreshSessionTokens,
	setSessionCookies
} from '$lib/server/auth';
import { checkAuthRateLimit } from '$lib/server/rate-limit';
import { warmPlaywrightDevicesCache } from '$lib/server/playwright-devices';
import { ensureSuperuser } from '$lib/server/superuser';

const isAuthRoute = (pathname: string): boolean => pathname.startsWith('/api/v1/auth/');
const isScreenshotRoute = (pathname: string): boolean => pathname.startsWith('/api/v1/screenshots/');
const isApiRoute = (pathname: string): boolean => pathname.startsWith('/api/v1');
const isAuthPageRoute = (pathname: string): boolean => pathname.startsWith('/auth');
const isPublicPdfReportRoute = (pathname: string): boolean =>
	/^\/jobs\/[^/]+\/pdf\/?$/.test(pathname);
const isStaticAssetRoute = (pathname: string): boolean =>
	pathname.startsWith('/_app/') || pathname === '/favicon.ico' || pathname === '/robots.txt';
const isPublicDashboardRoute = (pathname: string): boolean =>
	isAuthPageRoute(pathname) ||
	pathname === '/health' ||
	isStaticAssetRoute(pathname) ||
	isPublicPdfReportRoute(pathname);
let configValidated = false;
let superuserEnsured = false;

// Best-effort startup warmup for local playwright devices cache.
warmPlaywrightDevicesCache();

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

	if (!superuserEnsured && (config.appMode === 'api' || config.appMode === 'both')) {
		await ensureSuperuser();
		superuserEnsured = true;
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

	if (isApiRoute(pathname) && !isAuthRoute(pathname) && !isScreenshotRoute(pathname)) {
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

		const bearerToken = extractBearerToken(event.request.headers.get('authorization'));
		const authFromCookie = !bearerToken;

		let userCheck = await getCurrentUserStatus(event.locals.authToken);
		if (!userCheck.user && authFromCookie) {
			const accessCookie = event.cookies.get(config.sessionCookieName);
			const refreshCookie = event.cookies.get(config.sessionRefreshCookieName);
			if (accessCookie && refreshCookie) {
				try {
					const refreshed = await refreshSessionTokens(accessCookie, refreshCookie);
					if (refreshed?.access) {
						setSessionCookies(event, refreshed);
						event.locals.authToken = refreshed.access;
						userCheck = await getCurrentUserStatus(refreshed.access);
					}
				} catch (error) {
					if (config.debug) {
						const reason = error instanceof Error ? error.message : String(error);
						console.warn(`[web-api] ${event.locals.requestId} token refresh failed: ${reason}`);
					}
					return new Response('Service temporarily unavailable', { status: 503 });
				}
			}
		}

		if (!userCheck.user) {
			if (userCheck.transientError) {
				if (config.debug) {
					console.warn(`[web-api] ${event.locals.requestId} session validation failed due to transient error`);
				}
				return new Response('Service temporarily unavailable', { status: 503 });
			}
			if (config.debug) {
				console.warn(`[web-api] ${event.locals.requestId} session validation failed; redirecting to signin`);
			}
			clearSessionCookies(event);
			throw redirect(303, '/auth/signin');
		}

		event.locals.user = userCheck.user;

		// Sliding browser session: keep cookies alive while the user is active.
		if (authFromCookie) {
			const refreshCookie = event.cookies.get(config.sessionRefreshCookieName);
			setSessionCookies(event, {
				access: event.locals.authToken,
				refresh: refreshCookie
			});
		}
	}

	const response = await resolve(event);
	response.headers.set('x-request-id', event.locals.requestId);

	if (config.debug && isApiRoute(pathname)) {
		const elapsed = Date.now() - started;
		console.log(`[web-api] ${event.locals.requestId} ${event.request.method} ${pathname} -> ${response.status} (${elapsed}ms)`);
	}

	return response;
};
