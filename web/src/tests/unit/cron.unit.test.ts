import { describe, expect, test } from 'bun:test';
import { getCronMinimumIntervalSeconds, isCronMinIntervalAllowed } from '$lib/cron';

describe('Cron helpers', () => {
	test('computes minimum interval for stepped minute expressions', () => {
		const interval = getCronMinimumIntervalSeconds('0/10 * * * *');
		expect(interval).toBe(600);
	});

	test('enforces configurable minimum interval', () => {
		expect(isCronMinIntervalAllowed('0 * * * *', 3600)).toBeTrue();
		expect(isCronMinIntervalAllowed('0 * * * *', 7200)).toBeFalse();
		expect(isCronMinIntervalAllowed('*/30 * * * *', 3600)).toBeFalse();
		expect(isCronMinIntervalAllowed('0 */2 * * *', 7200)).toBeTrue();
	});
});
