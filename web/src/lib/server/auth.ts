import type { RequestEvent } from '@sveltejs/kit';
import { config } from './config';
import { withUserDb } from './db';

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	role?: 'admin' | 'editor' | 'viewer';
	created_at?: string;
}

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

export const getCurrentUser = async (token: string): Promise<AuthUser | null> => {
	try {
		return await withUserDb(token, async (db) => {
			const [rows] = await db
				.query('SELECT id, email, name, role, created_at FROM users WHERE id = $auth.id LIMIT 1;')
				.collect<[AuthUser[]]>();
			return rows?.[0] ?? null;
		});
	} catch {
		return null;
	}
};
