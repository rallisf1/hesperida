import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { queryMany, queryOne, withAdminDb } from '../../lib/server/db';

let initialized = false;
const DB_TIMEOUT_MS = Number.parseInt(process.env.TEST_DB_TIMEOUT_MS || '10000', 10);
const schemaPath = resolve(process.cwd(), '..', 'schema.surql');

const withTimeout = async <T>(promise: Promise<T>, op: string): Promise<T> => {
	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => {
			reject(
				new Error(
					`SurrealDB ${op} timed out after ${DB_TIMEOUT_MS}ms. Check SURREAL_ADDRESS/SURREAL_PROTOCOL and that DB is reachable.`
				)
			);
		}, DB_TIMEOUT_MS);
	});
	return Promise.race([promise, timeout]);
};

const normalizeId = (value: unknown): string => {
	const normalizeString = (input: string): string => {
		const trimmed = input.trim();
		const unquoted = trimmed.replace(/^['"]+|['"]+$/g, '');
		const recordIdWrapped = unquoted.match(/^RecordId\((.+)\)$/);
		const wrappedRaw = recordIdWrapped ? recordIdWrapped[1] : unquoted;
		const raw = wrappedRaw.replace(/^['"]+|['"]+$/g, '');
		return raw.replace(/^([a-z_]+):\1:/i, '$1:');
	};

	if (typeof value === 'string') return normalizeString(value);
	if (typeof value === 'number' || typeof value === 'bigint') return String(value);
	if (value && typeof value === 'object') {
		const maybe = value as { tb?: unknown; id?: unknown };
		if (typeof maybe.tb === 'string' && typeof maybe.id !== 'undefined') {
			const idValue = normalizeString(String(maybe.id));
			return idValue.includes(':') ? idValue : `${maybe.tb}:${idValue}`;
		}
		if ('toString' in value && typeof (value as { toString: () => string }).toString === 'function') {
			const text = (value as { toString: () => string }).toString();
			if (text && text !== '[object Object]') return normalizeString(text);
		}
	}
	throw new Error(`Unexpected record id shape: ${JSON.stringify(value)} (${String(value)})`);
};

const extractRawId = (value: unknown): string => {
	const normalized = normalizeId(value);
	const parts = normalized.split(':');
	return parts.length > 1 ? parts.slice(1).join(':') : normalized;
};

export const withAdmin = async <T>(work: (db: any) => Promise<T>): Promise<T> => {
	return withTimeout(withAdminDb(work), 'query');
};

export const ensureSchema = async (): Promise<void> => {
	if (initialized) return;

	const schema = readFileSync(schemaPath, 'utf8');
	await withAdmin(async (db) => {
		await db.query(schema).collect();
	});
	initialized = true;
};

export const resetData = async (): Promise<void> => {
	await withAdmin(async (db) => {
		await db
			.query(`
				DELETE job_queue;
				DELETE jobs;
				DELETE websites;
				DELETE users;
				DELETE probe_results;
				DELETE seo_results;
				DELETE ssl_results;
				DELETE whois_results;
				DELETE wcag_results;
				DELETE domain_results;
				DELETE security_results;
				DELETE stress_results;
			`)
			.collect();
	});
};

export const adminOne = async <T>(sql: string, vars?: Record<string, unknown>): Promise<T | null> => {
	return withTimeout(withAdminDb((db) => queryOne<T>(db, sql, vars)), 'query');
};

export const adminMany = async <T>(sql: string, vars?: Record<string, unknown>): Promise<T[]> => {
	return withTimeout(withAdminDb((db) => queryMany<T>(db, sql, vars)), 'query');
};

export const createUser = async (input: { name: string; email: string; password: string; role?: 'admin' | 'editor' | 'viewer' }) => {
	return adminOne<{ id: string; name: string; email: string; role?: 'admin' | 'editor' | 'viewer' }>(
		`CREATE users CONTENT {
			name: $name,
			email: $email,
			password: crypto::argon2::generate($password),
			role: $role
		} RETURN AFTER;`,
		{ ...input, role: input.role ?? 'editor' }
	);
};

export const createWebsite = async (input: { user: unknown; url: string; description: string; verified?: boolean }) => {
	return adminOne<{ id: string; owner: string; users: string[]; url: string }>(
		`CREATE websites CONTENT {
			owner: type::record('users', $user),
			users: [type::record('users', $user)],
			url: $url,
			description: $description,
			verified: $verified
		} RETURN AFTER;`,
		{ ...input, user: extractRawId(input.user), verified: input.verified ?? false }
	);
};

export const createJob = async (input: {
	website: unknown;
	types: string[];
	status?: string;
	options?: Record<string, unknown> | null;
}) => {
	if (input.options && typeof input.options === 'object') {
		return adminOne<{ id: string; website: string; types: string[]; status: string; options?: Record<string, unknown> | null }>(
			`CREATE jobs CONTENT {
				website: type::record('websites', $website),
				types: $types,
				status: $status,
				options: $options
			} RETURN AFTER;`,
			{ status: input.status ?? 'pending', ...input, website: extractRawId(input.website) }
		);
	}

	return adminOne<{ id: string; website: string; types: string[]; status: string; options?: Record<string, unknown> | null }>(
		`CREATE jobs CONTENT {
			website: type::record('websites', $website),
			types: $types,
			status: $status
		} RETURN AFTER;`,
		{ status: input.status ?? 'pending', ...input, website: extractRawId(input.website) }
	);
};

export const createQueueTask = async (input: {
	job: unknown;
	type: string;
	status?: string;
	target?: string;
	attempts?: number;
	options?: Record<string, unknown> | null;
}) => {
	if (input.options && typeof input.options === 'object') {
		return adminOne<{ id: string; status: string; type: string; job: string }>(
			`CREATE job_queue CONTENT {
				job: type::record('jobs', $job),
				type: $type,
				status: $status,
				target: $target,
				attempts: $attempts,
				options: $options,
				next_run_at: time::now()
			} RETURN AFTER;`,
			{
				status: input.status ?? 'waiting',
				target: input.target ?? '',
				attempts: input.attempts ?? 0,
				...input,
				job: extractRawId(input.job)
			}
		);
	}

	return adminOne<{ id: string; status: string; type: string; job: string }>(
		`CREATE job_queue CONTENT {
			job: type::record('jobs', $job),
			type: $type,
			status: $status,
			target: $target,
			attempts: $attempts,
			next_run_at: time::now()
		} RETURN AFTER;`,
		{
			status: input.status ?? 'waiting',
			target: input.target ?? '',
			attempts: input.attempts ?? 0,
			...input,
			job: extractRawId(input.job)
		}
	);
};

export const getJobById = async (id: unknown) => {
	return adminOne<{ id: string; status: string }>(
		'SELECT id, status FROM jobs WHERE id = type::record(\'jobs\', $id) LIMIT 1;',
		{ id: extractRawId(id) }
	);
};
