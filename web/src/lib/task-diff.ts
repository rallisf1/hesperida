export type DiffClassification = 'new' | 'fixed' | 'stale' | 'changed';

export type DiffItem = {
	key: string;
	label: string;
	group?: string;
	classification: DiffClassification;
	left_value: string | null;
	right_value: string | null;
	left_status: string | null;
	right_status: string | null;
};

export type DiffResult = {
	score_delta: {
		left: number;
		right: number;
		delta: number;
		delta_percent: number | null;
	} | null;
	latency_delta_ms: {
		left: number;
		right: number;
		delta: number;
		delta_percent: number | null;
	} | null;
	summary: {
		new: number;
		fixed: number;
		stale: number;
		changed: number;
		total: number;
	};
	items: DiffItem[];
};

type ScalarRow = {
	key: string;
	label: string;
	group?: string;
	status?: string;
	value: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asNumber = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const formatValue = (value: unknown): string => {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) return value.map((entry) => formatValue(entry)).join(', ');
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const flattenObject = (
	value: unknown,
	prefix = '',
	depth = 0,
	maxDepth = 3
): ScalarRow[] => {
	if (depth > maxDepth || value === null || value === undefined) return [];
	if (typeof value !== 'object') {
		return prefix ? [{ key: prefix, label: prefix, value: formatValue(value) }] : [];
	}
	if (Array.isArray(value)) {
		if (!value.length) return [];
		const onlyScalars = value.every((entry) => typeof entry !== 'object' || entry === null);
		if (onlyScalars) {
			return prefix ? [{ key: prefix, label: prefix, value: formatValue(value) }] : [];
		}
		return value.flatMap((entry, index) => flattenObject(entry, `${prefix}[${index}]`, depth + 1, maxDepth));
	}
	const objectValue = asRecord(value);
	return Object.entries(objectValue).flatMap(([key, nested]) => {
		if (key === 'id' || key === 'job' || key === 'created_at') return [];
		const nextPrefix = prefix ? `${prefix}.${key}` : key;
		if (nested && typeof nested === 'object') {
			return flattenObject(nested, nextPrefix, depth + 1, maxDepth);
		}
		return [{ key: nextPrefix, label: nextPrefix, value: formatValue(nested) }];
	});
};

const mapWcagRows = (result: Record<string, unknown>): ScalarRow[] => {
	const raw = asRecord(result.raw);
	const toRows = (bucket: 'violations' | 'incomplete' | 'passes', status: string): ScalarRow[] =>
		asArray(raw[bucket]).map((entry, index) => {
			const rule = asRecord(entry);
			const id = String(rule.id ?? `${bucket}-${index + 1}`);
			const impact = String(rule.impact ?? 'unknown');
			const nodes = asArray(rule.nodes).length;
			return {
				key: `wcag.${bucket}.${id}`,
				label: id,
				group: impact,
				status,
				value: `${nodes} nodes`
			};
		});
	return [...toRows('violations', 'fail'), ...toRows('incomplete', 'warn'), ...toRows('passes', 'pass')];
};

const mapSecurityRows = (result: Record<string, unknown>): ScalarRow[] => {
	const raw = asRecord(result.raw);
	return asArray(raw.findings).map((entry, index) => {
		const finding = asRecord(entry);
		const vulnerability = String(finding.vulnerability ?? `finding-${index + 1}`);
		const risk = String(finding.risk_level ?? 'info').toLowerCase();
		const status = risk === 'critical' || risk === 'high' ? 'fail' : risk === 'medium' || risk === 'low' ? 'warn' : 'info';
		return {
			key: `security.${vulnerability}`,
			label: vulnerability,
			group: String(finding.source ?? 'security'),
			status,
			value: String(finding.description ?? '')
		};
	});
};

const mapSeoRows = (result: Record<string, unknown>): ScalarRow[] => {
	const raw = asRecord(result.raw);
	const categories = asArray(raw.categoryResults);
	return categories.flatMap((category, catIndex) => {
		const cat = asRecord(category);
		const group = String(cat.categoryId ?? `category-${catIndex + 1}`);
		return asArray(cat.results).map((entry, index) => {
			const row = asRecord(entry);
			const id = String(row.ruleId ?? `rule-${catIndex + 1}-${index + 1}`);
			return {
				key: `seo.${group}.${id}`,
				label: id,
				group,
				status: String(row.status ?? 'info'),
				value: String(row.message ?? '')
			};
		});
	});
};

const mapStressRows = (result: Record<string, unknown>): ScalarRow[] => {
	const raw = asRecord(result.raw);
	const report = asRecord(raw.report);
	const latencies = asRecord(report.latencies);
	return [
		{ key: 'stress.requests', label: 'requests', value: formatValue(report.requests) },
		{ key: 'stress.success', label: 'success', value: formatValue(report.success) },
		{ key: 'stress.throughput', label: 'throughput', value: formatValue(report.throughput) },
		{ key: 'stress.latency.95th', label: 'latency p95', value: formatValue(latencies['95th']) },
		{ key: 'stress.latency.max', label: 'latency max', value: formatValue(latencies.max) },
		{ key: 'stress.status_codes', label: 'status codes', value: formatValue(report.status_codes) }
	].filter((row) => row.value.trim().length > 0);
};

const adaptRows = (tool: string, result: unknown): ScalarRow[] => {
	const record = asRecord(result);
	if (tool === 'seo') return mapSeoRows(record);
	if (tool === 'wcag') return mapWcagRows(record);
	if (tool === 'security') return mapSecurityRows(record);
	if (tool === 'stress') return mapStressRows(record);
	return flattenObject(record, tool);
};

const signature = (row: ScalarRow): string =>
	JSON.stringify({ status: row.status ?? null, value: row.value ?? '' });

const computeDeltaPercent = (left: number, right: number): number | null =>
	left === 0 ? null : ((right - left) / Math.abs(left)) * 100;

const toLatencyMs = (tool: string, result: Record<string, unknown>): number | null => {
	if (tool === 'stress') {
		const raw = asRecord(result.raw);
		const report = asRecord(raw.report);
		const latencies = asRecord(report.latencies);
		const value = asNumber(latencies['95th']);
		return value === null ? null : value / 1_000_000;
	}
	if (tool === 'probe') {
		const value = String(result.response_time ?? '').trim().toLowerCase();
		if (!value) return null;
		if (value.endsWith('ms')) {
			const parsed = Number.parseFloat(value.slice(0, -2));
			return Number.isFinite(parsed) ? parsed : null;
		}
		if (value.endsWith('s')) {
			const parsed = Number.parseFloat(value.slice(0, -1));
			return Number.isFinite(parsed) ? parsed * 1000 : null;
		}
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

export const createDiff = (
	tool: string,
	leftResult: unknown,
	rightResult: unknown
): DiffResult => {
	const leftRows = adaptRows(tool, leftResult);
	const rightRows = adaptRows(tool, rightResult);

	const leftMap = new Map(leftRows.map((row) => [row.key, row]));
	const rightMap = new Map(rightRows.map((row) => [row.key, row]));
	const keys = new Set<string>([...leftMap.keys(), ...rightMap.keys()]);
	const items: DiffItem[] = [];

	for (const key of keys) {
		const left = leftMap.get(key);
		const right = rightMap.get(key);
		const label = right?.label ?? left?.label ?? key;
		const group = right?.group ?? left?.group;
		if (!left && right) {
			items.push({
				key,
				label,
				group,
				classification: 'new',
				left_value: null,
				right_value: right.value,
				left_status: null,
				right_status: right.status ?? null
			});
			continue;
		}
		if (left && !right) {
			items.push({
				key,
				label,
				group,
				classification: 'fixed',
				left_value: left.value,
				right_value: null,
				left_status: left.status ?? null,
				right_status: null
			});
			continue;
		}
		if (!left || !right) continue;
		items.push({
			key,
			label,
			group,
			classification: signature(left) === signature(right) ? 'stale' : 'changed',
			left_value: left.value,
			right_value: right.value,
			left_status: left.status ?? null,
			right_status: right.status ?? null
		});
	}

	const order: Record<DiffClassification, number> = {
		changed: 0,
		new: 1,
		fixed: 2,
		stale: 3
	};
	items.sort((a, b) => {
		const classDiff = order[a.classification] - order[b.classification];
		if (classDiff !== 0) return classDiff;
		const groupDiff = (a.group ?? '').localeCompare(b.group ?? '');
		if (groupDiff !== 0) return groupDiff;
		return a.label.localeCompare(b.label);
	});

	const leftScore = asNumber(asRecord(leftResult).score);
	const rightScore = asNumber(asRecord(rightResult).score);
	const score_delta =
		leftScore !== null && rightScore !== null
			? {
					left: leftScore,
					right: rightScore,
					delta: rightScore - leftScore,
					delta_percent: computeDeltaPercent(leftScore, rightScore)
				}
			: null;

	const leftLatency = toLatencyMs(tool, asRecord(leftResult));
	const rightLatency = toLatencyMs(tool, asRecord(rightResult));
	const latency_delta_ms =
		leftLatency !== null && rightLatency !== null
			? {
					left: leftLatency,
					right: rightLatency,
					delta: rightLatency - leftLatency,
					delta_percent: computeDeltaPercent(leftLatency, rightLatency)
				}
			: null;

	return {
		score_delta,
		latency_delta_ms,
		summary: {
			new: items.filter((row) => row.classification === 'new').length,
			fixed: items.filter((row) => row.classification === 'fixed').length,
			stale: items.filter((row) => row.classification === 'stale').length,
			changed: items.filter((row) => row.classification === 'changed').length,
			total: items.length
		},
		items
	};
};

