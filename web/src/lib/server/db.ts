import { Surreal } from 'surrealdb';
import { config } from './config';

const connectBase = async (): Promise<Surreal> => {
	const db = new Surreal();
	await db.connect(config.surrealWsUrl, {
		namespace: config.surrealNamespace,
		database: config.surrealDatabase
	});
	return db;
};

const connectAdmin = async (): Promise<Surreal> => {
	const db = new Surreal();
	await db.connect(config.surrealWsUrl, {
		namespace: config.surrealNamespace,
		database: config.surrealDatabase,
		authentication: {
			username: config.surrealUser,
			password: config.surrealPass
		}
	});
	return db;
};

const connectWithToken = async (token: string): Promise<Surreal> => {
	const db = await connectBase();
	await db.authenticate(token);
	return db;
};

export const withAdminDb = async <T>(work: (db: Surreal) => Promise<T>): Promise<T> => {
	const db = await connectAdmin();
	try {
		return await work(db);
	} finally {
		await db.close();
	}
};

export const withAnonDb = async <T>(work: (db: Surreal) => Promise<T>): Promise<T> => {
	const db = await connectBase();
	try {
		return await work(db);
	} finally {
		await db.close();
	}
};

export const withUserDb = async <T>(token: string, work: (db: Surreal) => Promise<T>): Promise<T> => {
	const db = await connectWithToken(token);
	try {
		return await work(db);
	} finally {
		await db.close();
	}
};

export const toRecordId = (table: string, id: string): string => {
	const normalized = decodeURIComponent(id).trim();
	return normalized.includes(':') ? normalized : `${table}:${normalized}`;
};

export const queryMany = async <T>(
	db: Surreal,
	sql: string,
	vars?: Record<string, unknown>
): Promise<T[]> => {
	const [rows] = await db.query(sql, vars).collect<[T[]]>();
	return rows ?? [];
};

export const queryOne = async <T>(
	db: Surreal,
	sql: string,
	vars?: Record<string, unknown>
): Promise<T | null> => {
	const rows = await queryMany<T>(db, sql, vars);
	return rows[0] ?? null;
};

export const getJob = async (jobId: string, token: string, role?: string) => {
	if (role === 'admin') {
		return withAdminDb((db) => queryOne(db, 'SELECT * FROM jobs WHERE id = type::record($id) LIMIT 1;', { id: jobId }));
	}
	return withUserDb(token, (db) => queryOne(db, 'SELECT * FROM jobs WHERE id = type::record($id) LIMIT 1;', { id: jobId }));
};