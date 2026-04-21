import type { ApiWebsiteNotificationEvents } from '$lib/types/api';

export const defaultWebsiteNotificationEvents = (): ApiWebsiteNotificationEvents => ({
	JOB_COMPLETED: false,
	JOB_FAILED: true,
	SEO_SCORE_BELOW: null,
	STRESS_SCORE_BELOW: null,
	WCAG_SCORE_BELOW: null,
	SECURITY_SCORE_BELOW: null
});

export const describeWebsiteNotificationEvents = (events: ApiWebsiteNotificationEvents): string[] => {
	const labels: string[] = [];
	if (events.JOB_COMPLETED) labels.push('Job completed');
	if (events.JOB_FAILED) labels.push('Job failed');
	if (events.SEO_SCORE_BELOW !== null) labels.push(`SEO < ${events.SEO_SCORE_BELOW}`);
	if (events.STRESS_SCORE_BELOW !== null) labels.push(`Stress < ${events.STRESS_SCORE_BELOW}`);
	if (events.WCAG_SCORE_BELOW !== null) labels.push(`WCAG < ${events.WCAG_SCORE_BELOW}`);
	if (events.SECURITY_SCORE_BELOW !== null) labels.push(`Security < ${events.SECURITY_SCORE_BELOW}`);
	return labels;
};

