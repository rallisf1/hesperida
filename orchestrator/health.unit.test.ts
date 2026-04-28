import { describe, expect, test } from 'bun:test';
import { evaluateOrchestratorHealth } from './health';

const FIXED_NOW = () => new Date('2026-04-27T00:00:00.000Z');

describe('orchestrator strict health readiness', () => {
	test('returns 200 when startup, db, and docker checks are healthy', async () => {
		const result = await evaluateOrchestratorHealth({
			startupComplete: true,
			checkDatabase: async () => {},
			checkDocker: async () => {},
			now: FIXED_NOW
		});

		expect(result.statusCode).toBe(200);
		expect(result.body.status).toBe('ok');
		expect(result.body.timestamp).toBe('2026-04-27T00:00:00.000Z');
		expect(result.body.startup.status).toBe('ready');
		expect(result.body.database.status).toBe('ok');
		expect(result.body.docker.status).toBe('ok');
	});

	test('returns 503 when startup is incomplete and skips dependency checks', async () => {
		let dbCalled = false;
		let dockerCalled = false;
		const result = await evaluateOrchestratorHealth({
			startupComplete: false,
			checkDatabase: async () => {
				dbCalled = true;
			},
			checkDocker: async () => {
				dockerCalled = true;
			},
			now: FIXED_NOW
		});

		expect(result.statusCode).toBe(503);
		expect(result.body.status).toBe('error');
		expect(result.body.startup.status).toBe('starting');
		expect(result.body.database.status).toBe('skipped');
		expect(result.body.docker.status).toBe('skipped');
		expect(result.body.error?.code).toBe('startup_incomplete');
		expect(dbCalled).toBeFalse();
		expect(dockerCalled).toBeFalse();
	});

	test('returns 503 when database check fails', async () => {
		const result = await evaluateOrchestratorHealth({
			startupComplete: true,
			checkDatabase: async () => {
				throw new Error('db down');
			},
			checkDocker: async () => {},
			now: FIXED_NOW
		});

		expect(result.statusCode).toBe(503);
		expect(result.body.status).toBe('error');
		expect(result.body.database.status).toBe('unreachable');
		expect(result.body.docker.status).toBe('skipped');
		expect(result.body.error?.code).toBe('db_unreachable');
	});

	test('returns 503 when database check times out', async () => {
		const result = await evaluateOrchestratorHealth({
			startupComplete: true,
			checkDatabase: async () => await new Promise<void>(() => {}),
			checkDocker: async () => {},
			timeoutMs: 10,
			now: FIXED_NOW
		});

		expect(result.statusCode).toBe(503);
		expect(result.body.status).toBe('error');
		expect(result.body.database.status).toBe('timeout');
		expect(result.body.error?.code).toBe('db_timeout');
	});

	test('returns 503 when docker check fails', async () => {
		const result = await evaluateOrchestratorHealth({
			startupComplete: true,
			checkDatabase: async () => {},
			checkDocker: async () => {
				throw new Error('docker unavailable');
			},
			now: FIXED_NOW
		});

		expect(result.statusCode).toBe(503);
		expect(result.body.status).toBe('error');
		expect(result.body.database.status).toBe('ok');
		expect(result.body.docker.status).toBe('unreachable');
		expect(result.body.error?.code).toBe('docker_unreachable');
	});

	test('returns 503 when docker check times out', async () => {
		const result = await evaluateOrchestratorHealth({
			startupComplete: true,
			checkDatabase: async () => {},
			checkDocker: async () => await new Promise<void>(() => {}),
			timeoutMs: 10,
			now: FIXED_NOW
		});

		expect(result.statusCode).toBe(503);
		expect(result.body.status).toBe('error');
		expect(result.body.database.status).toBe('ok');
		expect(result.body.docker.status).toBe('timeout');
		expect(result.body.error?.code).toBe('docker_timeout');
	});
});
