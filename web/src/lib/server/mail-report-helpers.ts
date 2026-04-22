import type { NormalizedReportRow } from '$lib/server/report-normalization';

export type MailDeduction = {
	check: string;
	points: number;
	reason: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown, fallback = ''): string => {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
};

const toKebabCase = (value: string): string =>
	value
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[_\s]+/g, '-')
		.toLowerCase();

const toToken = (value: string): string => toKebabCase(value).replace(/[^a-z0-9]/g, '');

const deductionCandidatesForGroup = (group: string): Set<string> => {
	const kebab = toKebabCase(group);
	const compact = toToken(group);
	const values = new Set<string>([kebab, compact]);

	if (compact === 'reversedns') values.add('ptr');
	if (compact === 'domainage') values.add('domain-age');
	if (compact === 'mxtls') values.add('mx-tls');
	if (compact === 'mtasts') values.add('mta-sts');
	if (compact === 'tlsrpt') values.add('tls-rpt');

	return values;
};

const deductionMatchesGroup = (deductionCheck: string, group: string): boolean => {
	const candidates = deductionCandidatesForGroup(group);
	const normalizedCheck = toKebabCase(deductionCheck);
	const compactCheck = toToken(deductionCheck);
	return candidates.has(normalizedCheck) || candidates.has(compactCheck);
};

export const extractMailDeductionsFromRaw = (raw: unknown): MailDeduction[] => {
	const source = asRecord(raw);
	const score = asRecord(source.score);
	const deductions = asArray(score.deductions);

	return deductions
		.map((item) => {
			const entry = asRecord(item);
			return {
				check: asString(entry.check).trim(),
				points: asNumber(entry.points),
				reason: asString(entry.reason).trim()
			};
		})
		.filter((entry) => entry.check.length > 0 && entry.points > 0);
};

export const getMailDeductionPointsForRow = (
	row: Pick<NormalizedReportRow, 'group'>,
	deductions: MailDeduction[]
): number => {
	let highest = 0;
	for (const deduction of deductions) {
		if (!deductionMatchesGroup(deduction.check, row.group)) continue;
		highest = Math.max(highest, deduction.points);
	}
	return highest;
};

export const resolveMailPainPointPriority = (
	row: Pick<NormalizedReportRow, 'status' | 'group'>,
	deductions: MailDeduction[]
): number => {
	const points = getMailDeductionPointsForRow(row, deductions);
	if (points > 0) {
		return Math.min(95, 45 + points * 10);
	}
	return row.status === 'fail' ? 70 : 45;
};

export const buildMailTldrLine = (
	mailRows: NormalizedReportRow[],
	deductions: MailDeduction[]
): string => {
	const mailErrors = mailRows.filter((row) => row.status === 'fail').length;
	const mailWarnings = mailRows.filter((row) => row.status === 'warn').length;
	const totalDeductionPoints = deductions.reduce((sum, entry) => sum + entry.points, 0);

	if (mailErrors === 0 && mailWarnings === 0) {
		return 'Mail checks did not report warnings or errors.';
	}

	const issuesPart = `Mail checks reported ${mailErrors} error${mailErrors === 1 ? '' : 's'} and ${mailWarnings} warning${mailWarnings === 1 ? '' : 's'}.`;
	if (totalDeductionPoints > 0) {
		return `${issuesPart} These findings account for ${totalDeductionPoints} deduction point${totalDeductionPoints === 1 ? '' : 's'} in the mail score.`;
	}

	return issuesPart;
};
