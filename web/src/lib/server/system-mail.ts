import nodemailer, { type Transporter } from 'nodemailer';
import { config, isSmtpConfigured } from '$lib/server/config';
import { renderTemplate } from '$lib/server/notifications/render';

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

const APP_NAME = 'Hesperida';

let transporter: Transporter | null = null;

const isTestRuntime = (): boolean => {
	return Boolean(process.env.TEST_RUN_ID);
};

const getTransporter = (): Transporter => {
	if (transporter) return transporter;

	if (isTestRuntime()) {
		transporter = nodemailer.createTransport({
			jsonTransport: true
		});
		return transporter;
	}

	transporter = nodemailer.createTransport({
		host: config.smtpHost,
		port: config.smtpPort,
		secure: config.smtpSecure,
		auth: {
			user: config.smtpUser,
			pass: config.smtpPass
		}
	});

	return transporter;
};

const sendSystemMail = async (input: {
	to: string;
	subject: string;
	html: string;
	text: string;
}): Promise<void> => {
	if (!isSmtpConfigured()) {
		throw new Error('SMTP is not configured.');
	}

	if (isTestRuntime() && input.to.toLowerCase().includes('fail')) {
		throw new Error('Mock SMTP failure');
	}

	const transport = getTransporter();
	await transport.sendMail({
		from: config.smtpFrom,
		to: input.to,
		subject: input.subject,
		text: input.text,
		html: input.html
	});
};

export const sendForgotSystemEmail = async (context: SendForgotContext): Promise<void> => {
	const variables = {
		app_name: APP_NAME,
		brand_logo_url: config.notificationBrandLogoUrl,
		public_dashboard_url: config.publicDashboardUrl,
		recipient_email: context.email,
		forgot_token: context.forgotToken
	};

	await sendSystemMail({
		to: context.email,
		subject: 'Password Reset Request',
		html: renderTemplate('forgot', 'long', variables),
		text: renderTemplate('forgot', 'short', variables)
	});
};

export const sendInviteSystemEmail = async (context: SendInviteContext): Promise<void> => {
	const setupLine = context.isNewUser
		? `Reset token: ${context.forgotToken ?? 'N/A'}`
		: 'You can now access this website from your dashboard.';

	const variables = {
		app_name: APP_NAME,
		brand_logo_url: config.notificationBrandLogoUrl,
		public_dashboard_url: config.publicDashboardUrl,
		website_url: context.websiteUrl,
		inviter_name: context.inviterName,
		setup_line: setupLine
	};

	await sendSystemMail({
		to: context.email,
		subject: 'Website Invitation',
		html: renderTemplate('invite', 'long', variables),
		text: renderTemplate('invite', 'short', variables)
	});
};
