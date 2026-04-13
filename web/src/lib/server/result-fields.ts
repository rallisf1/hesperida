import { DateTime } from 'surrealdb';

const toDateTime = (value: unknown): DateTime | null => {
	if (!value) return null;
	if (value instanceof DateTime) return value;
	try {
		return new DateTime(String(value));
	} catch {
		return null;
	}
};

export const computeExpiresInDays = (targetDate: unknown, now: DateTime = new DateTime()): number | null => {
	const target = toDateTime(targetDate);
	if (!target) return null;

	const duration = target.diff(now) as unknown as { days?: string | number | bigint };
	const rawDays = duration?.days;
	const parsedDays =
		typeof rawDays === 'bigint'
			? Number(rawDays)
			: typeof rawDays === 'number'
				? rawDays
				: Number.parseFloat(String(rawDays ?? 'NaN'));

	if (!Number.isFinite(parsedDays)) return null;
	return Math.trunc(parsedDays);
};
