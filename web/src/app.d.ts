// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			requestId: string;
			authToken: string | null;
			user?: import('$lib/server/auth').AuthUser | null;
		}
	}
}

export {};
