import { DateTime } from 'surrealdb';

export type UserNotificationTarget = {
	id: string;
	target: string;
	label?: string;
	enabled: boolean;
	created_at: DateTime | string;
	updated_at: DateTime | string;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
};

export const parseNotificationTargets = (value: unknown): UserNotificationTarget[] => {
	if (!Array.isArray(value)) return [];
	const parsed: UserNotificationTarget[] = [];

	for (const entry of value) {
		const obj = asObject(entry);
		if (!obj) continue;

		const id = typeof obj.id === 'string' ? obj.id.trim() : '';
		const target = typeof obj.target === 'string' ? obj.target.trim() : '';
		const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : true;
		const label = typeof obj.label === 'string' ? obj.label.trim() : undefined;
		const createdAt = obj.created_at instanceof DateTime || typeof obj.created_at === 'string'
			? obj.created_at
			: new DateTime();
		const updatedAt = obj.updated_at instanceof DateTime || typeof obj.updated_at === 'string'
			? obj.updated_at
			: new DateTime();

		if (!id || !target) continue;
		parsed.push({
			id,
			target,
			enabled,
			...(label ? { label } : {}),
			created_at: createdAt,
			updated_at: updatedAt
		});
	}

	return parsed;
};

export const validateNotificationTarget = (target: unknown): string | null => {
	if (typeof target !== 'string') return null;
	const normalized = target.trim();
	if (!normalized) return null;
	if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) && !/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
		return null;
	}
	return normalized;
};
