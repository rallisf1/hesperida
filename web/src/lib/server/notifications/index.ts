import { sendAppriseNotification } from './apprise';
import { renderTemplate } from './render';

import { config } from '$lib/server/config';

type SendToTargetContext = {
	target: string;
	title: string;
	longBody: string;
	shortBody: string;
};

const APP_NAME = 'Hesperida';

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
	const variables = {
		app_name: APP_NAME,
		brand_logo_url: config.notificationBrandLogoUrl,
		recipient_email: 'test@example.com',
		forgot_token: 'TEST-TOKEN-123'
	};

	await sendToTarget({
		target,
		title: 'Hesperida Notification Test',
		longBody: renderTemplate('forgot', 'long', variables),
		shortBody: `${renderTemplate('forgot', 'short', variables)} [test]`
	});
};
