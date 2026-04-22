import { collectMailIssues } from '$lib/mail-issue-normalization';

export type ReportTool = 'seo' | 'stress' | 'wcag' | 'security' | 'mail';
export type ReportRowStatus = 'pass' | 'warn' | 'fail' | 'info';
export type ReportRowSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type NormalizedReportRow = {
	id: string;
	tool: ReportTool;
	group: string;
	check: string;
	status: ReportRowStatus;
	severity?: ReportRowSeverity;
	score?: number | null;
	value?: string;
	summary: string;
	details?: Record<string, unknown>;
};

type NormalizeOptions = {
	includeWcagPasses?: boolean;
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

const asNumber = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const isEmptyDetailValue = (value: unknown): boolean => {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim().length === 0;
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'object') return Object.keys(asRecord(value)).length === 0;
	return false;
};

const compactDetails = (
	details: Record<string, unknown>
): Record<string, unknown> | undefined => {
	const entries = Object.entries(details).filter(([, value]) => !isEmptyDetailValue(value));
	return entries.length ? Object.fromEntries(entries) : undefined;
};

const mapSeoStatus = (value: string): ReportRowStatus => {
	switch (value.toLowerCase()) {
		case 'pass':
			return 'pass';
		case 'warn':
			return 'warn';
		case 'fail':
			return 'fail';
		default:
			return 'info';
	}
};

const mapSecuritySeverity = (value: string): ReportRowSeverity => {
	switch (value.toLowerCase()) {
		case 'critical':
			return 'critical';
		case 'high':
			return 'high';
		case 'medium':
			return 'medium';
		case 'low':
			return 'low';
		default:
			return 'info';
	}
};

const securitySeverityToStatus = (severity: ReportRowSeverity): ReportRowStatus => {
	switch (severity) {
		case 'critical':
		case 'high':
			return 'fail';
		case 'medium':
		case 'low':
			return 'warn';
		case 'info':
		default:
			return 'info';
	}
};

const wcagImpactToSeverity = (impact: string): ReportRowSeverity => {
	switch (impact.toLowerCase()) {
		case 'critical':
			return 'critical';
		case 'serious':
			return 'high';
		case 'moderate':
			return 'medium';
		case 'minor':
			return 'low';
		default:
			return 'info';
	}
};

const normalizeSeoRows = (raw: unknown): NormalizedReportRow[] => {
	const source = asRecord(raw);
	const categories = asArray(source.categoryResults);
	const rows: NormalizedReportRow[] = [];

	categories.forEach((categoryValue, categoryIndex) => {
		const category = asRecord(categoryValue);
		const group = asString(category.categoryId, `category-${categoryIndex + 1}`);
		const results = asArray(category.results);

		results.forEach((resultValue, resultIndex) => {
			const result = asRecord(resultValue);
			const details = asRecord(result.details);
			const ruleId = asString(result.ruleId, `rule-${categoryIndex + 1}-${resultIndex + 1}`);
			const message = cleanText(asString(result.message, ruleId));
			const pageUrl = asString(details.pageUrl || details.url || '');

			rows.push({
				id: `seo:${group}:${ruleId}:${resultIndex}`,
				tool: 'seo',
				group,
				check: ruleId,
				status: mapSeoStatus(asString(result.status, 'info')),
				score: asNumber(result.score),
				value: pageUrl,
				summary: message || 'No summary available',
				details: compactDetails(details)
			});
		});
	});

	return rows;
};

const normalizeSecurityRows = (raw: unknown): NormalizedReportRow[] => {
	const source = asRecord(raw);
	const findings = asArray(source.findings);
	const rows: NormalizedReportRow[] = [];

	findings.forEach((findingValue, index) => {
		const finding = asRecord(findingValue);
		const severity = mapSecuritySeverity(asString(finding.risk_level, 'info'));
		rows.push({
			id: `security:${index}`,
			tool: 'security',
			group: asString(finding.source, 'security'),
			check: asString(finding.vulnerability, `finding-${index + 1}`),
			status: securitySeverityToStatus(severity),
			severity,
			value: asString(finding.reference || finding.website || ''),
			summary: cleanText(asString(finding.description, 'No description available')),
			details: compactDetails({
				reference: finding.reference,
				website: finding.website,
				risk_level: finding.risk_level
			})
		});
	});

	return rows;
};

const normalizeWcagRows = (
	raw: unknown,
	options: NormalizeOptions = {}
): NormalizedReportRow[] => {
	const source = asRecord(raw);
	const rows: NormalizedReportRow[] = [];

	const append = (bucket: 'violations' | 'incomplete' | 'passes', status: ReportRowStatus) => {
		const rules = asArray(source[bucket]);
		rules.forEach((ruleValue, index) => {
			const rule = asRecord(ruleValue);
			const nodes = asArray(rule.nodes);
			const impact = asString(rule.impact, 'unknown').toLowerCase() || 'unknown';
			const nodePaths = nodes
				.flatMap((node) => asArray(asRecord(node).target).map((target) => asString(target)))
				.filter((target) => target.length > 0);

			rows.push({
				id: `wcag:${bucket}:${index}`,
				tool: 'wcag',
				group: impact,
				check: asString(rule.id, `${bucket}-${index + 1}`),
				status,
				severity: wcagImpactToSeverity(impact),
				value: `${nodes.length} node${nodes.length === 1 ? '' : 's'}`,
				summary: cleanText(
					asString(rule.description, asString(rule.help, 'No description available'))
				),
				details: compactDetails({
					help: rule.help,
					help_url: rule.helpUrl,
					tags: rule.tags,
					failure_summary: rule.failureSummary,
					node_paths: nodePaths
				})
			});
		});
	};

	append('violations', 'fail');
	append('incomplete', 'warn');
	if (options.includeWcagPasses) append('passes', 'pass');

	return rows;
};

const nsToMs = (value: number | null): number | null =>
	value === null ? null : value / 1_000_000;

const formatMs = (value: number | null): string =>
	value === null ? 'n/a' : `${value.toFixed(2)} ms`;

const formatPercent = (value: number | null): string =>
	value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;

const normalizeMailRows = (raw: unknown): NormalizedReportRow[] => {
	return collectMailIssues(raw).map((row) => ({
		...row,
		tool: 'mail'
	}));
};

const normalizeStressRows = (raw: unknown): NormalizedReportRow[] => {
	const source = asRecord(raw);
	const report = asRecord(source.report);
	const config = asRecord(source.config);
	const latencyWarnMs = asNumber(config.latency_warn_ms) ?? 500;
	const rows: NormalizedReportRow[] = [];

	const errors = asArray(report.errors);
	const successRatio = asNumber(report.success);
	const requests = asNumber(report.requests);
	const throughput = asNumber(report.throughput);
	const statusCodes = asRecord(report.status_codes);
	const latencies = asRecord(report.latencies);

	const non2xx = Object.entries(statusCodes).reduce((acc, [code, count]) => {
		const parsedCode = Number.parseInt(code, 10);
		const amount = asNumber(count) ?? 0;
		if (!Number.isFinite(parsedCode)) return acc;
		return parsedCode < 200 || parsedCode > 299 ? acc + amount : acc;
	}, 0);

	const push = (
		index: number,
		row: Omit<NormalizedReportRow, 'id' | 'tool'>
	): void => {
		rows.push({ id: `stress:${index}:${row.check}`, tool: 'stress', ...row });
	};

	const availabilityStatus: ReportRowStatus =
		errors.length > 0
			? 'fail'
			: successRatio !== null && successRatio < 0.95
				? 'fail'
				: successRatio !== null && successRatio < 1
					? 'warn'
					: 'pass';

	push(0, {
		group: 'summary',
		check: 'availability',
		status: availabilityStatus,
		value: formatPercent(successRatio),
		summary: `${errors.length} transport error${errors.length === 1 ? '' : 's'} detected`,
		details: compactDetails({
			success_ratio: successRatio,
			errors,
			error_count: errors.length
		})
	});

	push(1, {
		group: 'summary',
		check: 'requests',
		status: requests && requests > 0 ? 'pass' : 'warn',
		value: requests === null ? 'n/a' : String(requests),
		summary: 'Total requests executed during the test run',
		details: compactDetails({ requests })
	});

	push(2, {
		group: 'summary',
		check: 'throughput',
		status: throughput && throughput > 0 ? 'pass' : 'warn',
		value: throughput === null ? 'n/a' : `${throughput.toFixed(2)} rps`,
		summary: 'Observed request throughput',
		details: compactDetails({ throughput })
	});

	const latencyThresholdStatus = (ms: number | null): ReportRowStatus => {
		if (ms === null) return 'info';
		if (ms > latencyWarnMs * 2) return 'fail';
		if (ms > latencyWarnMs) return 'warn';
		return 'pass';
	};

	const latencyKeys = ['50th', '90th', '95th', '99th', 'max'] as const;
	latencyKeys.forEach((key, index) => {
		const rawLatency = asNumber(latencies[key]);
		const latencyMs = nsToMs(rawLatency);
		push(3 + index, {
			group: 'latency',
			check: key === 'max' ? 'latency max' : `latency p${key.replace('th', '')}`,
			status: latencyThresholdStatus(latencyMs),
			value: formatMs(latencyMs),
			summary: `Threshold: ${latencyWarnMs} ms warning`,
			details: compactDetails({
				raw_ns: rawLatency,
				threshold_warn_ms: latencyWarnMs
			})
		});
	});

	push(10, {
		group: 'response',
		check: 'status codes',
		status: non2xx > 0 ? 'warn' : 'pass',
		value: Object.entries(statusCodes)
			.map(([code, count]) => `${code}:${asString(count)}`)
			.join(', '),
		summary: non2xx > 0 ? `${non2xx} non-2xx responses detected` : 'All responses are 2xx',
		details: compactDetails({ status_codes: statusCodes, non_2xx_count: non2xx })
	});

	return rows;
};

const statusOrder: Record<ReportRowStatus, number> = {
	fail: 0,
	warn: 1,
	info: 2,
	pass: 3
};

const wcagGroupOrder = (group: string): number => {
	switch (group.toLowerCase()) {
		case 'serious':
			return 0;
		case 'moderate':
			return 1;
		case 'unknown':
			return 2;
		default:
			return 3;
	}
};

export const sortNormalizedRows = (
	tool: ReportTool,
	rows: NormalizedReportRow[]
): NormalizedReportRow[] => {
	return [...rows].sort((a, b) => {
		const statusDiff = statusOrder[a.status] - statusOrder[b.status];
		if (statusDiff !== 0) return statusDiff;

		if (tool === 'wcag') {
			const groupDiff = wcagGroupOrder(a.group) - wcagGroupOrder(b.group);
			if (groupDiff !== 0) return groupDiff;
		}

		const groupDiff = a.group.localeCompare(b.group);
		if (groupDiff !== 0) return groupDiff;
		return a.check.localeCompare(b.check);
	});
};

export const normalizeToolRows = (
	tool: ReportTool,
	raw: unknown,
	options: NormalizeOptions = {}
): NormalizedReportRow[] => {
	const rows =
		tool === 'seo'
			? normalizeSeoRows(raw)
			: tool === 'security'
				? normalizeSecurityRows(raw)
				: tool === 'wcag'
					? normalizeWcagRows(raw, options)
						: tool === 'stress' 
							? normalizeStressRows(raw)
							: normalizeMailRows(raw);

	return sortNormalizedRows(tool, rows);
};
