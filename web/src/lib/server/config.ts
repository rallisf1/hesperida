import { env } from '$env/dynamic/private';
import packageJson from '../../../package.json';

export type AppMode = 'both' | 'api' | 'dashboard';

const REQUIRED_IN_API_MODE = ['SURREAL_USER', 'SURREAL_PASS', 'SURREAL_NAMESPACE', 'SURREAL_DATABASE', 'SURREAL_ADDRESS', 'SURREAL_PROTOCOL'] as const;

const read = (name: string): string => env[name]?.trim() ?? '';

const appModeRaw = (read('APP_MODE') || 'both').toLowerCase();
if (!['both', 'api', 'dashboard'].includes(appModeRaw)) {
	throw new Error(`Invalid APP_MODE: ${appModeRaw}. Expected one of both|api|dashboard.`);
}

const packageMeta = packageJson as {
	version?: string;
	repository?: string | { url?: string };
};

const appMode = appModeRaw as AppMode;
const apiUrl = read('API_URL');
const apiKey = read('API_KEY');
const webApiKey = read('WEB_API_KEY');
const appriseUrl = read('APPRISE_URL');
const appriseApiKey = read('APPRISE_API_KEY');
const notificationBrandLogoUrl = read('NOTIFICATION_BRAND_LOGO_URL');
const publicDashboardUrl = read('DASHBOARD_URL');
const smtpPortRaw = read('SMTP_PORT');
const parsedSmtpPort = Number.parseInt(smtpPortRaw || '0', 10);
const gotenbergUrl = read('GOTENBERG_URL') || 'http://pdf:3000';
const authSignupEnabled = (read('AUTH_SIGNUP_ENABLED') || 'true').toLowerCase() === 'true';

const surrealProtocol = read('SURREAL_PROTOCOL') || 'http';
const wsProtocol = surrealProtocol === 'https' ? 'wss' : 'ws';

export const config = {
	appMode,
	apiUrl,
	apiKey,
	webApiKey,
	appriseUrl,
	appriseApiKey,
	notificationBrandLogoUrl,
	publicDashboardUrl,
	smtpHost: read('SMTP_HOST'),
	smtpPort: Number.isFinite(parsedSmtpPort) ? parsedSmtpPort : 0,
	smtpUser: read('SMTP_USER'),
	smtpPass: read('SMTP_PASS'),
	smtpSecure: (read('SMTP_SECURE') || 'false').toLowerCase() === 'true',
	smtpFrom: read('SMTP_FROM'),
	gotenbergUrl,
	authSignupEnabled,
	surrealUser: read('SURREAL_USER'),
	surrealPass: read('SURREAL_PASS'),
	surrealNamespace: read('SURREAL_NAMESPACE') || 'main',
	surrealDatabase: read('SURREAL_DATABASE') || 'main',
	surrealAddress: read('SURREAL_ADDRESS') || 'db:8000',
	surrealProtocol,
	surrealWsUrl: `${wsProtocol}://${read('SURREAL_ADDRESS') || 'db:8000'}`,
	surrealOptions: {
		reconnect: {
			enabled: true,
			attempts: 5,
			retryDelay: 1000
		}
	},
	sessionCookieName: read('SESSION_COOKIE_NAME') || 'hesperida_session',
	sessionRefreshCookieName: read('SESSION_REFRESH_COOKIE_NAME') || 'hesperida_refresh',
	sessionCookieSecure: (read('SESSION_COOKIE_SECURE') || 'false').toLowerCase() === 'true',
	sessionCookieMaxAge: Number.parseInt(read('SESSION_COOKIE_MAX_AGE') || `${60 * 60}`, 10),
	wappalyzerDB: read('WP_PATH') || '/app/wappalyzer.db',
	version: packageMeta.version,
	repoUrl: packageMeta.repository,
	debug: (read('DEBUG') || 'false').toLowerCase() === 'true'
} as const;

export const SMTP_NOT_CONFIGURED_MESSAGE =
	'SMTP env vars missing; this operation is disabled in single-user mode.';

export const isSmtpConfigured = (): boolean => {
	const host = read('SMTP_HOST');
	const port = Number.parseInt(read('SMTP_PORT') || '0', 10);
	const user = read('SMTP_USER');
	const pass = read('SMTP_PASS');
	const from = read('SMTP_FROM');

	return Boolean(
		host &&
			Number.isFinite(port) &&
			port > 0 &&
			user &&
			pass &&
			from
	);
};

export const getMissingRequiredEnv = (): string[] => {
	const missing: string[] = [];

	if (config.appMode === 'dashboard') {
		if (!config.apiUrl) missing.push('API_URL');
		if (!config.apiKey) missing.push('API_KEY');
	}

	if (config.appMode === 'api' || config.appMode === 'both') {
		if (!config.webApiKey) missing.push('WEB_API_KEY');
		for (const key of REQUIRED_IN_API_MODE) {
			if (!read(key)) missing.push(key);
		}
	}

	return [...new Set(missing)];
};
