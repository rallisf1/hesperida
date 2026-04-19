import type { LayoutServerLoad } from './$types';
import { config } from '$lib/server/config';

export const load: LayoutServerLoad = async ({ locals }) => {

	console.log(config);

	return {
		user: {
			name: locals.user?.name,
			email: locals.user?.email,
			role: locals.user?.role
		},
		locale: locals.locale,
		version: config.version
	};
};
