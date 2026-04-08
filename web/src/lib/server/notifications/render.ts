import { getTemplate, type NotificationTemplateName, type NotificationTemplateVariant } from './templates';

const PLACEHOLDER = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export const renderTemplate = (
	name: NotificationTemplateName,
	variant: NotificationTemplateVariant,
	variables: Record<string, string>
): string => {
	const template = getTemplate(name, variant);
	const rendered = template.replace(PLACEHOLDER, (_, key: string) => {
		if (!(key in variables)) {
			throw new Error(`Missing notification variable: ${key}`);
		}
		return String(variables[key]);
	});

	const leftovers = rendered.match(PLACEHOLDER);
	if (leftovers?.length) {
		throw new Error(`Unresolved notification placeholders: ${leftovers.join(', ')}`);
	}

	return rendered.trim();
};
