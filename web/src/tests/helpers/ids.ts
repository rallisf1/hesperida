export const normalizeRecordId = (value: unknown): string => {
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

export const toRouteId = (value: unknown): string => {
	const normalized = normalizeRecordId(value);
	const parts = normalized.split(':');
	return parts.length > 1 ? parts.slice(1).join(':') : normalized;
};

