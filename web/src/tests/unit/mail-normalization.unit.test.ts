import { describe, expect, test } from 'bun:test';
import { normalizeToolRows } from '../../lib/server/report-normalization';

describe('mail normalization', () => {
	test('maps warnings/errors/syntaxErrors to warn/fail rows', () => {
		const rows = normalizeToolRows('mail', {
			spf: {
				warnings: ['SPF uses ~all'],
				syntaxErrors: ['Invalid SPF mechanism']
			},
			domainAge: {
				errors: ['No RDAP server found for .gr']
			}
		});

		expect(rows.length).toBe(3);
		expect(rows.filter((row) => row.status === 'warn').length).toBe(1);
		expect(rows.filter((row) => row.status === 'fail').length).toBe(2);
		expect(rows.some((row) => row.group === 'spf' && row.summary === 'SPF uses ~all')).toBeTrue();
		expect(
			rows.some((row) => row.group === 'domainAge' && row.summary === 'No RDAP server found for .gr')
		).toBeTrue();
	});

	test('fills group/check/summary consistently for nested issue arrays', () => {
		const rows = normalizeToolRows('mail', {
			dkim: {
				selectors: [
					{
						warnings: ['RSA key should be 2048+ bits']
					}
				]
			}
		});

		expect(rows.length).toBe(1);
		expect(rows[0]?.group).toBe('dkim');
		expect(rows[0]?.check).toContain('selectors');
		expect(rows[0]?.check).toContain('warnings');
		expect(rows[0]?.summary).toBe('RSA key should be 2048+ bits');
		expect(rows[0]?.status).toBe('warn');
	});

	test('does not produce rows from score.deductions', () => {
		const rows = normalizeToolRows('mail', {
			score: {
				deductions: [
					{
						check: 'dkim',
						points: 2,
						reason: 'DKIM key should be 2048+ bits (1024)'
					}
				]
			},
			dkim: {
				warnings: ['DKIM warning from check output']
			}
		});

		expect(rows.length).toBe(1);
		expect(rows[0]?.summary).toBe('DKIM warning from check output');
		expect(rows.some((row) => row.summary.includes('2048+ bits (1024)'))).toBeFalse();
	});
});
