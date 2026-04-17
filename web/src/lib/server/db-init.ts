import schemaSurql from './schema.surql?raw';
import { queryOne, withAdminDb } from './db';
import { config } from './config';

const SUPERUSER_EMAIL = 'hesperida@local.me';
const SUPERUSER_NAME = 'Hesperida Superuser';
const SUPERUSER_GROUP = 'superuser';

let ensurePromise: Promise<void> | null = null;

const applySchema = async (): Promise<void> => {
	await withAdminDb(async (db) => {
		const [schemaVersion] = await db.query('RETURN $schemaVersion').collect();
		if(schemaVersion !== config.version) {
			await db.import(schemaSurql);
			await db.query(`DEFINE PARAM OVERWRITE $schemaVersion VALUE '${config.version}'`);
		}
	});
};

const ensureSuperuser = async (): Promise<void> => {
	await withAdminDb(async (db) => {
		const existing = await queryOne<{ id: string }>(
			db,
			'SELECT id FROM users WHERE is_superuser = true LIMIT 1;'
		);
		if (existing?.id) return;

		await db
			.query(
				`CREATE users CONTENT {
					name: $name,
					email: $email,
					password: crypto::argon2::generate($password),
					role: 'admin',
					is_superuser: true,
					\`group\`: $group
				};`,
				{
					name: SUPERUSER_NAME,
					email: SUPERUSER_EMAIL,
					password: config.surrealPass,
					group: SUPERUSER_GROUP
				}
			)
			.collect();
	});
};

export const ensureDbInit = async (): Promise<void> => {
	await applySchema();
	if (!ensurePromise) {
		ensurePromise = (async () => {
			await ensureSuperuser();
		})().finally(() => {
			ensurePromise = null;
		});
	}
	await ensurePromise;
};
