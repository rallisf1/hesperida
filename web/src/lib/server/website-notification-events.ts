import type { WebsiteNotificationEvents } from '$lib/types';

type EventThresholdKey =
	| 'SEO_SCORE_BELOW'
	| 'STRESS_SCORE_BELOW'
	| 'WCAG_SCORE_BELOW'
	| 'SECURITY_SCORE_BELOW';

export const WEBSITE_NOTIFICATION_THRESHOLD_KEYS: EventThresholdKey[] = [
	'SEO_SCORE_BELOW',
	'STRESS_SCORE_BELOW',
	'WCAG_SCORE_BELOW',
	'SECURITY_SCORE_BELOW'
];

export const defaultWebsiteNotificationEvents = (): WebsiteNotificationEvents => ({
	JOB_COMPLETED: false,
	JOB_FAILED: true,
	SEO_SCORE_BELOW: null,
	STRESS_SCORE_BELOW: null,
	WCAG_SCORE_BELOW: null,
	SECURITY_SCORE_BELOW: null
});

const parseThreshold = (value: unknown): number | null | undefined => {
	if (typeof value === 'undefined') return undefined;
	if (value === null || value === '') return null;
	const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
	if (!Number.isFinite(numeric)) return undefined;
	if (numeric < 0 || numeric > 100) return undefined;
	return numeric;
};

export const parseWebsiteNotificationEvents = (
	input: unknown,
	base: WebsiteNotificationEvents = defaultWebsiteNotificationEvents()
): WebsiteNotificationEvents | null => {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	const parsed: WebsiteNotificationEvents = {
		...base,
		JOB_COMPLETED:
			typeof record.JOB_COMPLETED === 'boolean' ? record.JOB_COMPLETED : base.JOB_COMPLETED,
		JOB_FAILED: typeof record.JOB_FAILED === 'boolean' ? record.JOB_FAILED : base.JOB_FAILED,
		SEO_SCORE_BELOW: base.SEO_SCORE_BELOW,
		STRESS_SCORE_BELOW: base.STRESS_SCORE_BELOW,
		WCAG_SCORE_BELOW: base.WCAG_SCORE_BELOW,
		SECURITY_SCORE_BELOW: base.SECURITY_SCORE_BELOW
	};

	for (const key of WEBSITE_NOTIFICATION_THRESHOLD_KEYS) {
		const next = parseThreshold(record[key]);
		if (typeof next === 'undefined') {
			parsed[key] = base[key];
			continue;
		}
		parsed[key] = next;
	}

	return parsed;
};

export const hasEnabledWebsiteNotificationEvent = (events: WebsiteNotificationEvents): boolean =>
	events.JOB_COMPLETED ||
	events.JOB_FAILED ||
	WEBSITE_NOTIFICATION_THRESHOLD_KEYS.some((key) => events[key] !== null);
