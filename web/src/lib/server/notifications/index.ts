import { config } from '$lib/server/config';
import { sendAppriseNotification } from './apprise';
import { renderTemplate } from './render';

export type NotificationChannelMode = 'auto' | 'long' | 'short';

type SendForgotContext = {
	email: string;
	forgotToken: string;
};

type SendInviteContext = {
	email: string;
	websiteUrl: string;
	inviterName: string;
	isNewUser: boolean;
	forgotToken?: string;
};

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

export const buildEmailTarget = (email: string): string => {
	const normalized = email.trim().toLowerCase();
	if (!normalized) {
		throw new Error('Recipient email is required for notification target resolution.');
	}

	const template = config.notificationEmailTargetTemplate;
	if (!template || !template.includes('{{email}}')) {
		throw new Error('NOTIFICATION_EMAIL_TARGET_TEMPLATE must include {{email}}.');
	}

	return template.replaceAll('{{email}}', normalized);
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

export const sendForgotNotification = async (context: SendForgotContext): Promise<void> => {
	const target = buildEmailTarget(context.email);
	const variables = {
		app_name: APP_NAME,
		brand_logo_url: config.notificationBrandLogoUrl,
		recipient_email: context.email,
		forgot_token: context.forgotToken
	};

	await sendToTarget({
		target,
		title: 'Password Reset Request',
		longBody: renderTemplate('forgot', 'long', variables),
		shortBody: renderTemplate('forgot', 'short', variables)
	});
};

export const sendInviteNotification = async (context: SendInviteContext): Promise<void> => {
	const target = buildEmailTarget(context.email);
	const setupLine = context.isNewUser
		? `Reset token: ${context.forgotToken ?? 'N/A'}`
		: 'You can now access this website from your dashboard.';

	const variables = {
		app_name: APP_NAME,
		brand_logo_url: config.notificationBrandLogoUrl,
		website_url: context.websiteUrl,
		inviter_name: context.inviterName,
		setup_line: setupLine
	};

	await sendToTarget({
		target,
		title: 'Website Invitation',
		longBody: renderTemplate('invite', 'long', variables),
		shortBody: renderTemplate('invite', 'short', variables)
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
