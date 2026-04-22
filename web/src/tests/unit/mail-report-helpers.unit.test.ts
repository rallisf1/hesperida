import { describe, expect, test } from 'bun:test';
import {
	buildMailTldrLine,
	resolveMailPainPointPriority,
	type MailDeduction
} from '../../lib/server/mail-report-helpers';
import type { NormalizedReportRow } from '../../lib/server/report-normalization';

const baseRow = (overrides: Partial<NormalizedReportRow>): NormalizedReportRow => ({
	id: 'mail:test:1',
	tool: 'mail',
	group: 'mail',
	check: 'warning',
	status: 'warn',
	summary: 'Issue reported',
	...overrides
});

describe('mail report helpers', () => {
	test('pain point priority uses matching deduction points when available', () => {
		const row = baseRow({ group: 'reverseDns', status: 'warn' });
		const deductions: MailDeduction[] = [{ check: 'ptr', points: 3, reason: 'Missing reverse DNS' }];

		const priority = resolveMailPainPointPriority(row, deductions);
		expect(priority).toBe(75);
	});

	test('pain point priority falls back when no deduction match exists', () => {
		const failRow = baseRow({ group: 'bimi', status: 'fail' });
		const warnRow = baseRow({ group: 'bimi', status: 'warn' });

		expect(resolveMailPainPointPriority(failRow, [])).toBe(70);
		expect(resolveMailPainPointPriority(warnRow, [])).toBe(45);
	});

	test('mail tldr reflects clean and problematic states', () => {
		const clean = buildMailTldrLine([], []);
		expect(clean).toBe('Mail checks did not report warnings or errors.');

		const rows: NormalizedReportRow[] = [
			baseRow({ id: 'mail:1', status: 'fail' }),
			baseRow({ id: 'mail:2', status: 'warn' }),
			baseRow({ id: 'mail:3', status: 'warn' })
		];
		const deductions: MailDeduction[] = [{ check: 'dkim', points: 2, reason: 'Weak key' }];

		const problematic = buildMailTldrLine(rows, deductions);
		expect(problematic).toContain('1 error');
		expect(problematic).toContain('2 warnings');
		expect(problematic).toContain('2 deduction points');
	});
});
