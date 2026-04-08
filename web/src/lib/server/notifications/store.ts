import type { Surreal } from 'surrealdb';
import { queryOne } from '$lib/server/db';
import { parseNotificationTargets, type UserNotificationTarget } from './targets';

type UserTargetsRow = {
	notification_targets?: unknown;
};

export const getUserNotificationTargets = async (db: Surreal): Promise<UserNotificationTarget[]> => {
	const row = await queryOne<UserTargetsRow>(
		db,
		'SELECT notification_targets FROM users WHERE id = $auth.id LIMIT 1;'
	);
	return parseNotificationTargets(row?.notification_targets);
};

export const saveUserNotificationTargets = async (
	db: Surreal,
	targets: UserNotificationTarget[]
): Promise<UserNotificationTarget[]> => {
	const updated = await queryOne<UserTargetsRow>(
		db,
		'UPDATE users SET notification_targets = $targets WHERE id = $auth.id RETURN notification_targets;',
		{ targets }
	);
	return parseNotificationTargets(updated?.notification_targets);
};
