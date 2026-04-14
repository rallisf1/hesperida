import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { queryOne, withAdminDb, withUserDb } from '$lib/server/db';
import { isSuperuser } from '$lib/server/policy';
import { RecordId } from 'surrealdb';
import { jsonError } from '$lib/server/http';
import type { WCAG } from '$lib/types';

const toBytes = (value: unknown): Uint8Array | null => {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
		return Uint8Array.from(value as number[]);
	}
	return null;
};

/**
 * @swagger
 * /api/v1/screenshots/{id}:
 *   get:
 *     tags: [Screenshots]
 *     summary: Proxy WCAG screenshot image by wcag_results id
 *     security:
 *       - apiKeyAuth: []
 *         bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: wcag_results record id value
 *     responses:
 *       200:
 *         description: PNG screenshot bytes
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireUser(event);
	if ('error' in auth) return auth.error;

	const wcagId = new RecordId('wcag_results', event.params.id);

	const wcag = isSuperuser(auth.user)
		? await withAdminDb((db) => queryOne<Partial<WCAG>>(db, 'SELECT screenshot FROM wcag_results WHERE id = $id LIMIT 1;', { id: wcagId }))
		: await withUserDb(auth.token, (db) =>
				queryOne<Partial<WCAG>>(db, 'SELECT screenshot FROM wcag_results WHERE id = $id LIMIT 1;', { id: wcagId })
		  );

	if (!wcag?.screenshot) {
		return jsonError(event, 404, 'not_found', 'Screenshot not found.');
	}

	const [ss] = isSuperuser(auth.user)
		? await withAdminDb(async (db) => {
				const result = await db
					.query(`f"screenshots:/${wcag.screenshot}".get()`)
					.collect<[Uint8Array]>()
				return result;
		  })
		: await withUserDb(auth.token, async (db) => {
				const result = await db
					.query(`f"screenshots:/${wcag.screenshot}".get()`)
					.collect<[Uint8Array]>()
				return result;
		  });

	const bytes = toBytes(ss);
	if (!bytes || bytes.byteLength === 0) {
		return jsonError(event, 404, 'not_found', 'Screenshot content not found.');
	}
	return new Response(bytes as unknown as BodyInit, {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'private, max-age=31536000'
		}
	});
};
