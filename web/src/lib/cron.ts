import { CronExpressionParser } from 'cron-parser';

const normalizeCron = (expression: string): string => expression.trim().split(/\s+/).join(' ');
const DEFAULT_SAMPLE_SIZE = 64;
const DEFAULT_SEED_DATE = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));

export const isValidUtcCron = (expression: string): boolean => {
	const normalized = normalizeCron(expression);
	if (!normalized) return false;

	try {
		CronExpressionParser.parse(normalized, { tz: 'UTC' });
		return true;
	} catch {
		return false;
	}
};

export const getNextUtcRun = (expression: string, from = new Date()): Date | null => {
	const normalized = normalizeCron(expression);
	if (!normalized || Number.isNaN(from.getTime())) return null;

	try {
		const interval = CronExpressionParser.parse(normalized, {
			currentDate: from,
			tz: 'UTC'
		});
		const next = interval.next();
		return new Date(next.getTime());
	} catch {
		return null;
	}
};

export const getNextUtcRunIso = (expression: string, from = new Date()): string | null => {
	const next = getNextUtcRun(expression, from);
	return next ? next.toISOString() : null;
};

export const getCronMinimumIntervalSeconds = (
	expression: string,
	options?: {
		sampleSize?: number;
		seedDate?: Date;
	}
): number | null => {
	const normalized = normalizeCron(expression);
	if (!normalized) return null;

	const sampleSize = Number.isFinite(options?.sampleSize)
		? Math.max(2, Number(options?.sampleSize))
		: DEFAULT_SAMPLE_SIZE;
	const seedDate = options?.seedDate ?? DEFAULT_SEED_DATE;
	if (Number.isNaN(seedDate.getTime())) return null;

	try {
		const interval = CronExpressionParser.parse(normalized, {
			currentDate: seedDate,
			tz: 'UTC'
		});

		let previous: Date | null = null;
		let minDelta = Number.POSITIVE_INFINITY;

		for (let i = 0; i < sampleSize; i += 1) {
			const current = new Date(interval.next().getTime());
			if (Number.isNaN(current.getTime())) return null;

			if (previous) {
				const deltaSeconds = Math.floor((current.getTime() - previous.getTime()) / 1000);
				if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return null;
				if (deltaSeconds < minDelta) minDelta = deltaSeconds;
			}

			previous = current;
		}

		return Number.isFinite(minDelta) ? minDelta : null;
	} catch {
		return null;
	}
};

export const isCronMinIntervalAllowed = (
	expression: string,
	minIntervalSeconds: number,
	options?: {
		sampleSize?: number;
		seedDate?: Date;
	}
): boolean => {
	if (!Number.isFinite(minIntervalSeconds) || minIntervalSeconds <= 0) return false;
	const minimumDetected = getCronMinimumIntervalSeconds(expression, options);
	if (minimumDetected == null) return false;
	return minimumDetected >= minIntervalSeconds;
};
