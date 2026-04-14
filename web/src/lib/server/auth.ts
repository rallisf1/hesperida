import type { RequestEvent } from '@sveltejs/kit';
import { config } from './config';
import { withAnonDb, withUserDb } from './db';
import type { RecordId } from 'surrealdb';

export interface AuthUser {
	id: RecordId;
	email: string;
	name: string;
	group: string;
	is_superuser: boolean;
	role?: 'admin' | 'editor' | 'viewer';
	created_at?: string;
}

export interface SessionTokens {
	access: string;
	refresh?: string | null;
}

const isLikelyAuthError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error ?? '');
	const normalized = message.toLowerCase();
	return (
		normalized.includes('not allowed') ||
		normalized.includes('auth') ||
		normalized.includes('token') ||
		normalized.includes('unauthorized') ||
		normalized.includes('forbidden') ||
		normalized.includes('expired') ||
		normalized.includes('invalid')
	);
};

export const extractBearerToken = (value: string | null): string | null => {
	if (!value) return null;
	const [scheme, token] = value.trim().split(/\s+/, 2);
	if (!scheme || !token) return null;
	if (scheme.toLowerCase() !== 'bearer') return null;
	return token;
};

export const getAuthToken = (event: RequestEvent): string | null => {
	const bearer = extractBearerToken(event.request.headers.get('authorization'));
	if (bearer) return bearer;
	const cookieToken = event.cookies.get(config.sessionCookieName);
	return cookieToken ?? null;
};

export const setSessionCookies = (event: RequestEvent, tokens: SessionTokens): void => {
	event.cookies.set(config.sessionCookieName, tokens.access, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: config.sessionCookieSecure,
		maxAge: config.sessionCookieMaxAge
	});

	if (tokens.refresh && tokens.refresh.trim()) {
		event.cookies.set(config.sessionRefreshCookieName, tokens.refresh, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: config.sessionCookieSecure,
			maxAge: config.sessionCookieMaxAge
		});
	} else {
		event.cookies.delete(config.sessionRefreshCookieName, { path: '/' });
	}
};

export const clearSessionCookies = (event: RequestEvent): void => {
	event.cookies.delete(config.sessionCookieName, { path: '/' });
	event.cookies.delete(config.sessionRefreshCookieName, { path: '/' });
};

export const getCurrentUserStatus = async (
	token: string
): Promise<{ user: AuthUser | null; transientError: boolean }> => {
	try {
		const user = await withUserDb(token, async (db) => {
			const [rows] = await db
				.query(
					'SELECT id, email, name, role, `group`, is_superuser, created_at FROM users WHERE id = $auth.id LIMIT 1;'
				)
				.collect<[AuthUser[]]>();
			return rows?.[0] ?? null;
		});
		return { user, transientError: false };
	} catch (error) {
		return { user: null, transientError: !isLikelyAuthError(error) };
	}
};

export const getCurrentUser = async (token: string): Promise<AuthUser | null> => {
	const { user } = await getCurrentUserStatus(token);
	return user;
};

export const refreshSessionTokens = async (
	access: string,
	refresh: string
): Promise<SessionTokens | null> => {
	try {
		return await withAnonDb(async (db) => {
			const next = await db.authenticate({ access, refresh });
			return {
				access: next.access,
				refresh: next.refresh ?? null
			};
		});
	} catch (error) {
		if (isLikelyAuthError(error)) return null;
		throw error;
	}
};
