export const validateNotificationTarget = (target: unknown): string | null => {
	if (typeof target !== 'string') return null;
	const normalized = target.trim();
	if (!normalized) return null;
	if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) && !/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
		return null;
	}
	return normalized;
};
