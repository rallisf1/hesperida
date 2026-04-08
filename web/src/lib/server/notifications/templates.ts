import forgotLong from './templates/long/forgot.html?raw';
import forgotShort from './templates/short/forgot.txt?raw';
import inviteLong from './templates/long/invite.html?raw';
import inviteShort from './templates/short/invite.txt?raw';

export type NotificationTemplateName = 'forgot' | 'invite';
export type NotificationTemplateVariant = 'long' | 'short';

const templates: Record<NotificationTemplateVariant, Record<NotificationTemplateName, string>> = {
	long: {
		forgot: forgotLong,
		invite: inviteLong
	},
	short: {
		forgot: forgotShort,
		invite: inviteShort
	}
};

export const getTemplate = (
	name: NotificationTemplateName,
	variant: NotificationTemplateVariant
): string => {
	const content = templates[variant]?.[name];
	if (!content) {
		throw new Error(`Missing notification template: ${variant}/${name}`);
	}
	return content;
};
