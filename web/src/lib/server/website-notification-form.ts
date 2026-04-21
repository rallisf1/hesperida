import type { ApiWebsiteNotificationEvents } from '$lib/types/api';

const parseOptionalThreshold = (value: FormDataEntryValue | null): number | null => {
	const raw = String(value ?? '').trim();
	if (!raw.length) return null;
	const numeric = Number.parseFloat(raw);
	if (!Number.isFinite(numeric)) return Number.NaN;
	return numeric;
};

export const parseWebsiteNotificationEventsForm = (
	formData: FormData
): ApiWebsiteNotificationEvents | null => {
	const seo = parseOptionalThreshold(formData.get('SEO_SCORE_BELOW'));
	const stress = parseOptionalThreshold(formData.get('STRESS_SCORE_BELOW'));
	const wcag = parseOptionalThreshold(formData.get('WCAG_SCORE_BELOW'));
	const security = parseOptionalThreshold(formData.get('SECURITY_SCORE_BELOW'));
	if ([seo, stress, wcag, security].some((value) => Number.isNaN(value))) {
		return null;
	}

	return {
		JOB_COMPLETED: formData.get('JOB_COMPLETED') === 'on',
		JOB_FAILED: formData.get('JOB_FAILED') === 'on',
		SEO_SCORE_BELOW: seo,
		STRESS_SCORE_BELOW: stress,
		WCAG_SCORE_BELOW: wcag,
		SECURITY_SCORE_BELOW: security
	};
};

