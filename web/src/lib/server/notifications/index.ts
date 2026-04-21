import { sendAppriseNotification } from './apprise';

type SendToTargetContext = {
	target: string;
	title: string;
	longBody: string;
	shortBody: string;
};

const SHORT_SCHEMES = new Set([
	'sms',
	'pushbullet',
	'pushover',
	'pushsafer',
	'fcm',
	'apns',
	'nma',
	'nextcloud'
]);

export const inferModeFromTarget = (target: string): 'long' | 'short' => {
	const scheme = target.split(':', 1)[0]?.toLowerCase() ?? '';
	if (SHORT_SCHEMES.has(scheme)) return 'short';
	return 'long';
};

const sendToTarget = async (context: SendToTargetContext): Promise<void> => {
	const mode = inferModeFromTarget(context.target);
	if (mode === 'short') {
		await sendAppriseNotification({
			targets: [context.target],
			title: context.title,
			body: context.shortBody,
			format: 'text'
		});
		return;
	}

	await sendAppriseNotification({
		targets: [context.target],
		title: context.title,
		body: context.longBody,
		format: 'html'
	});
};

export const sendTestNotificationToTarget = async (target: string): Promise<void> => {
	await sendToTarget({
		target,
		title: 'Hesperida Notification Test',
		longBody:
			'<p>This is a test notification from Hesperida.</p><p>If you received it, this Apprise URL works.</p>',
		shortBody: 'This is a test notification from Hesperida.'
	});
};
