import type { Surreal } from 'surrealdb';
import { queryOne } from '$lib/server/db';
import { parseNotificationTargets } from './targets';
import type { NotificationTarget, User } from '$lib/types';

export const getUserNotificationTargets = async (db: Surreal): Promise<NotificationTarget[]> => {
	const row = await queryOne<User>(
		db,
		'SELECT notification_targets FROM users WHERE id = $auth.id LIMIT 1;'
	);
	return parseNotificationTargets(row?.notification_targets);
};

export const saveUserNotificationTargets = async (
	db: Surreal,
	targets: NotificationTarget[]
): Promise<NotificationTarget[]> => {
	const updated = await queryOne<User>(
		db,
		'UPDATE users SET notification_targets = $targets WHERE id = $auth.id RETURN notification_targets;',
		{ targets }
	);
	return parseNotificationTargets(updated?.notification_targets);
};
