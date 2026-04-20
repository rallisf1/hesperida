import { getTemplate, type NotificationTemplateName, type NotificationTemplateVariant } from './templates';

const PLACEHOLDER = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const LONG_CONTENT_SLOT = '__HESPERIDA_CONTENT_SLOT__';

const LONG_BASE_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{app_name}}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;" align="left">
                <a href="{{public_dashboard_url}}" style="text-decoration:none;color:#111827;display:inline-flex;align-items:center;gap:10px;">
                  <img src="{{brand_logo_url}}" alt="{{app_name}}" style="max-height:42px;display:block;" />
                  <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827; font-size: 22px; line-height: 1.25; vertical-align:middle;">Hesperida Web Scanner</h1>
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827;">
                ${LONG_CONTENT_SLOT}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">
                <div>This message was sent by <a href="{{public_dashboard_url}}" style="color:#4b5563;text-decoration:underline;">{{app_name}}</a>.</div>
                <div style="margin-top:4px;">&copy; {{current_year}} {{app_name}}. All rights reserved.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const renderTemplate = (
	name: NotificationTemplateName,
	variant: NotificationTemplateVariant,
	variables: Record<string, string>
): string => {
	const template = getTemplate(name, variant);
	const mergedTemplate =
		variant === 'long'
			? LONG_BASE_TEMPLATE.replace(LONG_CONTENT_SLOT, template)
			: template;
	const resolvedVariables: Record<string, string> = {
		current_year: String(new Date().getUTCFullYear()),
		...variables
	};
	const rendered = mergedTemplate.replace(PLACEHOLDER, (_, key: string) => {
		if (!(key in resolvedVariables)) {
			throw new Error(`Missing notification variable: ${key}`);
		}
		return String(resolvedVariables[key]);
	});

	const leftovers = rendered.match(PLACEHOLDER);
	if (leftovers?.length) {
		throw new Error(`Unresolved notification placeholders: ${leftovers.join(', ')}`);
	}

	return rendered.trim();
};
