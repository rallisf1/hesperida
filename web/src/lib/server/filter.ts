export const parseAllowedFilter = <T extends string>(
	value: string | null | undefined,
	allowed: readonly T[],
	fallback: T
): T => {
	const normalized = (value ?? '').trim();
	if (!normalized) return fallback;
	return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
};

