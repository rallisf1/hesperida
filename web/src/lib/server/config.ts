import { env } from '$env/dynamic/private';

export type AppMode = 'both' | 'api' | 'dashboard';

const REQUIRED_IN_API_MODE = ['SURREAL_USER', 'SURREAL_PASS', 'SURREAL_NAMESPACE', 'SURREAL_DATABASE', 'SURREAL_ADDRESS', 'SURREAL_PROTOCOL'] as const;

const read = (name: string): string => env[name]?.trim() ?? '';

const appModeRaw = (read('APP_MODE') || 'both').toLowerCase();
if (!['both', 'api', 'dashboard'].includes(appModeRaw)) {
	throw new Error(`Invalid APP_MODE: ${appModeRaw}. Expected one of both|api|dashboard.`);
}

const appMode = appModeRaw as AppMode;
const apiUrl = read('API_URL');
const apiKey = read('API_KEY');
const webApiKey = read('WEB_API_KEY');
const appriseUrl = read('APPRISE_URL');
const appriseApiKey = read('APPRISE_API_KEY');
const notificationEmailTargetTemplate = read('NOTIFICATION_EMAIL_TARGET_TEMPLATE');
const notificationBrandLogoUrl = read('NOTIFICATION_BRAND_LOGO_URL');
const gotenbergUrl = read('GOTENBERG_URL') || 'http://pdf:3000';
const authSignupEnabled = (read('AUTH_SIGNUP_ENABLED') || 'true').toLowerCase() === 'true';
const websiteVerificationTtlRaw = read('WEBSITE_VERIFICATION_TTL_SECONDS') || '604800';
const websiteVerificationTtlSeconds = Number.parseInt(websiteVerificationTtlRaw, 10);
if (!Number.isFinite(websiteVerificationTtlSeconds) || websiteVerificationTtlSeconds < 1) {
	throw new Error(
		`Invalid WEBSITE_VERIFICATION_TTL_SECONDS: ${websiteVerificationTtlRaw}. Expected a positive integer.`
	);
}

const surrealProtocol = read('SURREAL_PROTOCOL') || 'http';
const wsProtocol = surrealProtocol === 'https' ? 'wss' : 'ws';

export const config = {
	appMode,
	apiUrl,
	apiKey,
	webApiKey,
	appriseUrl,
	appriseApiKey,
	notificationEmailTargetTemplate,
	notificationBrandLogoUrl,
	gotenbergUrl,
	authSignupEnabled,
	websiteVerificationTtlSeconds,
	surrealUser: read('SURREAL_USER'),
	surrealPass: read('SURREAL_PASS'),
	surrealNamespace: read('SURREAL_NAMESPACE') || 'main',
	surrealDatabase: read('SURREAL_DATABASE') || 'main',
	surrealAddress: read('SURREAL_ADDRESS') || 'db:8000',
	surrealProtocol,
	surrealWsUrl: `${wsProtocol}://${read('SURREAL_ADDRESS') || 'db:8000'}`,
	sessionCookieName: read('SESSION_COOKIE_NAME') || 'hesperida_session',
	sessionRefreshCookieName: read('SESSION_REFRESH_COOKIE_NAME') || 'hesperida_refresh',
	sessionCookieSecure: (read('SESSION_COOKIE_SECURE') || 'false').toLowerCase() === 'true',
	sessionCookieMaxAge: Number.parseInt(read('SESSION_COOKIE_MAX_AGE') || `${60 * 60}`, 10),
	wappalyzerDB: read('WP_PATH') || '/app/wappalyzer.db',
	debug: (read('DEBUG') || 'false').toLowerCase() === 'true'
} as const;

export const getMissingRequiredEnv = (): string[] => {
	const missing: string[] = [];

	if (config.appMode === 'dashboard') {
		if (!config.apiUrl) missing.push('API_URL');
		if (!config.apiKey) missing.push('API_KEY');
	}

	if (config.appMode === 'api' || config.appMode === 'both') {
		if (!config.webApiKey) missing.push('WEB_API_KEY');
		if (!config.appriseUrl) missing.push('APPRISE_URL');
		if (!config.notificationEmailTargetTemplate) missing.push('NOTIFICATION_EMAIL_TARGET_TEMPLATE');
		if (
			config.notificationEmailTargetTemplate &&
			!config.notificationEmailTargetTemplate.includes('{{email}}')
		) {
			missing.push('NOTIFICATION_EMAIL_TARGET_TEMPLATE(must include {{email}})');
		}
		if (!config.notificationBrandLogoUrl) missing.push('NOTIFICATION_BRAND_LOGO_URL');
		for (const key of REQUIRED_IN_API_MODE) {
			if (!read(key)) missing.push(key);
		}
	}

	return [...new Set(missing)];
};
