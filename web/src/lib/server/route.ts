import type { RequestEvent } from '@sveltejs/kit';
import { requireUser } from './guards';
import { jsonError, parseJson } from './http';

export type AuthContext = Awaited<ReturnType<typeof requireUser>> extends infer T
	? T extends { token: string; user: infer U }
		? { token: string; user: U }
		: never
	: never;

export const withRequiredUser = async (
	event: RequestEvent,
	handler: (auth: AuthContext) => Promise<Response> | Response
): Promise<Response> => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;
	return handler(auth as AuthContext);
};

export const parseJsonOrBadRequest = async (
	event: RequestEvent
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: Response }> => {
	try {
		const data = await parseJson(event.request);
		return { ok: true, data };
	} catch (error) {
		return {
			ok: false,
			response: jsonError(event, 400, 'bad_request', (error as Error).message)
		};
	}
};

// TODO: Standardize endpoint validation and error-map registry (deferred by plan item #6).

