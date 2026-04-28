export const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 2_000;

type DependencyState = 'ok' | 'unreachable' | 'timeout' | 'skipped';
type StartupState = 'ready' | 'starting';

type HealthErrorCode =
	| 'startup_incomplete'
	| 'db_unreachable'
	| 'db_timeout'
	| 'docker_unreachable'
	| 'docker_timeout';

type HealthError = {
	code: HealthErrorCode;
	message: string;
};

export type OrchestratorHealthPayload = {
	status: 'ok' | 'error';
	timestamp: string;
	startup: {
		status: StartupState;
	};
	database: {
		status: DependencyState;
	};
	docker: {
		status: DependencyState;
	};
	error?: HealthError;
};

export type OrchestratorHealthResult = {
	statusCode: number;
	body: OrchestratorHealthPayload;
};

export type OrchestratorHealthDependencies = {
	startupComplete: boolean;
	checkDatabase: () => Promise<unknown>;
	checkDocker: () => Promise<unknown>;
	timeoutMs?: number;
	now?: () => Date;
};

class HealthCheckTimeoutError extends Error {
	constructor() {
		super('health_check_timeout');
	}
}

const runWithTimeout = async (
	check: () => Promise<unknown>,
	timeoutMs: number
): Promise<'ok' | 'timeout' | 'unreachable'> => {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	try {
		await new Promise<void>((resolve, reject) => {
			timeoutId = setTimeout(() => reject(new HealthCheckTimeoutError()), timeoutMs);
			check().then(
				() => resolve(),
				(error) => reject(error)
			);
		});
		return 'ok';
	} catch (error) {
		if (error instanceof HealthCheckTimeoutError) return 'timeout';
		return 'unreachable';
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
};

const getTimestamp = (now?: () => Date): string => (now ? now() : new Date()).toISOString();

const startupIncompleteResult = (timestamp: string): OrchestratorHealthResult => ({
	statusCode: 503,
	body: {
		status: 'error',
		timestamp,
		startup: {
			status: 'starting'
		},
		database: {
			status: 'skipped'
		},
		docker: {
			status: 'skipped'
		},
		error: {
			code: 'startup_incomplete',
			message: 'Orchestrator startup is not complete.'
		}
	}
});

const dbFailedResult = (timestamp: string, state: 'timeout' | 'unreachable'): OrchestratorHealthResult => ({
	statusCode: 503,
	body: {
		status: 'error',
		timestamp,
		startup: {
			status: 'ready'
		},
		database: {
			status: state
		},
		docker: {
			status: 'skipped'
		},
		error: {
			code: state === 'timeout' ? 'db_timeout' : 'db_unreachable',
			message: state === 'timeout' ? 'Database health check timed out.' : 'Database health check failed.'
		}
	}
});

const dockerFailedResult = (
	timestamp: string,
	state: 'timeout' | 'unreachable'
): OrchestratorHealthResult => ({
	statusCode: 503,
	body: {
		status: 'error',
		timestamp,
		startup: {
			status: 'ready'
		},
		database: {
			status: 'ok'
		},
		docker: {
			status: state
		},
		error: {
			code: state === 'timeout' ? 'docker_timeout' : 'docker_unreachable',
			message: state === 'timeout' ? 'Docker health check timed out.' : 'Docker health check failed.'
		}
	}
});

const healthyResult = (timestamp: string): OrchestratorHealthResult => ({
	statusCode: 200,
	body: {
		status: 'ok',
		timestamp,
		startup: {
			status: 'ready'
		},
		database: {
			status: 'ok'
		},
		docker: {
			status: 'ok'
		}
	}
});

export const evaluateOrchestratorHealth = async ({
	startupComplete,
	checkDatabase,
	checkDocker,
	timeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
	now
}: OrchestratorHealthDependencies): Promise<OrchestratorHealthResult> => {
	const timestamp = getTimestamp(now);
	if (!startupComplete) return startupIncompleteResult(timestamp);

	const dbState = await runWithTimeout(checkDatabase, timeoutMs);
	if (dbState !== 'ok') return dbFailedResult(timestamp, dbState);

	const dockerState = await runWithTimeout(checkDocker, timeoutMs);
	if (dockerState !== 'ok') return dockerFailedResult(timestamp, dockerState);

	return healthyResult(timestamp);
};
