import { describe, expect, test } from 'bun:test';
import { renderTemplate } from '$lib/server/notifications/render';
import { sendAppriseNotification } from '$lib/server/notifications/apprise';

describe('Notifications helpers', () => {
	test('renders long and short template variants', () => {
		const long = renderTemplate('forgot', 'long', {
			app_name: 'Hesperida',
			brand_logo_url: 'https://example.test/logo.png',
			public_dashboard_url: 'https://dashboard.example.test',
			recipient_email: 'user@example.test',
			forgot_token: 'token-123'
		});
		const short = renderTemplate('forgot', 'short', {
			app_name: 'Hesperida',
			brand_logo_url: 'https://example.test/logo.png',
			public_dashboard_url: 'https://dashboard.example.test',
			recipient_email: 'user@example.test',
			forgot_token: 'token-123'
		});

		expect(long).toContain('token-123');
		expect(short).toContain('token-123');
	});

	test('throws when template variables are missing', () => {
		expect(() =>
			renderTemplate('invite', 'short', {
				website_url: 'https://example.test',
				inviter_name: 'Alice',
				app_name: 'Hesperida',
				brand_logo_url: 'https://example.test/logo.png'
			})
		).toThrow();
	});

	test('maps Apprise HTTP failure into error', async () => {
		await expect(
			sendAppriseNotification({
				targets: ['mock://fail'],
				title: 'Test',
				body: 'Body',
				format: 'text'
			})
		).rejects.toThrow('Apprise returned HTTP 500');
	});
});
