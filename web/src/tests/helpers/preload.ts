import { mock } from 'bun:test';

const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const baseNamespace = Bun.env.SURREAL_NAMESPACE?.trim() || 'main';
const baseDatabase = Bun.env.SURREAL_DATABASE?.trim() || 'main';

Bun.env.APP_MODE = Bun.env.APP_MODE?.trim() || 'both';
Bun.env.WEB_API_KEY = Bun.env.WEB_API_KEY?.trim() || 'test-web-api-key';
Bun.env.SURREAL_USER = Bun.env.SURREAL_USER?.trim() || 'root';
Bun.env.SURREAL_PASS = Bun.env.SURREAL_PASS?.trim() || 'root';
Bun.env.SURREAL_PROTOCOL = Bun.env.SURREAL_PROTOCOL?.trim() || 'http';
Bun.env.SURREAL_ADDRESS = Bun.env.SURREAL_ADDRESS?.trim() || 'db:8000';
Bun.env.DEBUG = Bun.env.DEBUG?.trim() || 'false';
Bun.env.NODE_ENV = Bun.env.NODE_ENV?.trim() || 'test';
Bun.env.APPRISE_URL = Bun.env.APPRISE_URL?.trim() || 'http://apprise.test';
Bun.env.APPRISE_API_KEY = Bun.env.APPRISE_API_KEY?.trim() || '';
Bun.env.NOTIFICATION_BRAND_LOGO_URL =
	Bun.env.NOTIFICATION_BRAND_LOGO_URL?.trim() || 'https://example.test/logo.png';
Bun.env.SMTP_HOST = Bun.env.SMTP_HOST?.trim() || 'smtp.test';
Bun.env.SMTP_PORT = Bun.env.SMTP_PORT?.trim() || '587';
Bun.env.SMTP_USER = Bun.env.SMTP_USER?.trim() || 'smtp-user';
Bun.env.SMTP_PASS = Bun.env.SMTP_PASS?.trim() || 'smtp-pass';
Bun.env.SMTP_SECURE = Bun.env.SMTP_SECURE?.trim() || 'false';
Bun.env.SMTP_FROM = Bun.env.SMTP_FROM?.trim() || 'Hesperida <noreply@example.test>';

Bun.env.SURREAL_NAMESPACE = `${baseNamespace}_api_test_${runId}`;
Bun.env.SURREAL_DATABASE = `${baseDatabase}_api_test_${runId}`;

Bun.env.TEST_RUN_ID = runId;

mock.module('$env/dynamic/private', () => ({ env: Bun.env }));

const nativeFetch = globalThis.fetch.bind(globalThis);
const mockedFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
	const parsed = (() => {
		try {
			return new URL(url);
		} catch {
			return null;
		}
	})();

	if (
		parsed &&
		parsed.hostname === 'cloudflare-dns.com' &&
		parsed.pathname === '/dns-query' &&
		parsed.searchParams.get('type') === 'TXT'
	) {
		return Response.json({ Status: 3, Answer: [] }, { status: 200 });
	}

	if (parsed && parsed.hostname.endsWith('.invalid') && parsed.pathname.startsWith('/hesperida-')) {
		return new Response('Not Found', { status: 404 });
	}

	if (parsed && parsed.hostname.endsWith('.example.test') && parsed.pathname.startsWith('/hesperida-')) {
		return new Response('', { status: 200 });
	}

	if (url.startsWith(Bun.env.APPRISE_URL || '')) {
		const payloadRaw = typeof init?.body === 'string' ? init.body : '';
		const payload = payloadRaw ? (JSON.parse(payloadRaw) as { urls?: string[] }) : {};
		const urls = Array.isArray(payload.urls) ? payload.urls : [];
		if (urls.some((item) => String(item).includes('mock://fail') || String(item).includes('fail'))) {
			return Response.json({ status: 'error', error: 'Mock Apprise failure' }, { status: 500 });
		}
		return Response.json({ status: 'success' }, { status: 200 });
	}

	return nativeFetch(input, init);
}) as typeof fetch;

Object.assign(mockedFetch, nativeFetch);
globalThis.fetch = mockedFetch;
