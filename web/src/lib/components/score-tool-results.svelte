<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { collectMailIssues } from '$lib/mail-issue-normalization';
	import type { Tool } from '$lib/types';
    import * as Select from './ui/select';

	type SupportedTool = 'seo' | 'stress' | 'wcag' | 'security' | 'mail';
	type RowStatus = 'pass' | 'warn' | 'fail' | 'info';
	type RowSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
	type StatusFilter = 'all' | RowStatus;

	type NormalizedRow = {
		id: string;
		tool: SupportedTool;
		group: string;
		check: string;
		status: RowStatus;
		severity?: RowSeverity;
		score?: number | null;
		value?: string;
		summary: string;
		details?: Record<string, unknown>;
	};

	type Details = Record<string, unknown>;

	let {
		data,
		tool
	}: {
		data: unknown;
		tool: Tool;
	} = $props();

	let search = $state('');
	let statusFilter = $state<StatusFilter>('all');
	let groupFilter = $state('all');

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

	const isEmptyDetailValue = (value: unknown): boolean => {
		if (value === null || value === undefined) return true;
		if (typeof value === 'string') return value.trim().length === 0;
		if (Array.isArray(value)) return value.length === 0;
		if (typeof value === 'object') return Object.keys(asRecord(value)).length === 0;
		return false;
	};

	const compactDetails = (details: Details): Details | undefined => {
		const entries = Object.entries(details).filter(([, value]) => !isEmptyDetailValue(value));
		return entries.length ? Object.fromEntries(entries) : undefined;
	};

	const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

	const humanizeToken = (value: string): string =>
		value
			.replace(/[_-]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

	const isSupportedTool = (value: Tool): value is SupportedTool =>
		value === 'seo' || value === 'stress' || value === 'wcag' || value === 'security' || value === 'mail';

	const mapSeoStatus = (value: string): RowStatus => {
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

	const mapSecuritySeverity = (value: string): RowSeverity => {
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

	const severityToStatus = (severity: RowSeverity): RowStatus => {
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

	const wcagImpactToSeverity = (impact: string): RowSeverity => {
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

	const normalizeSeo = (raw: unknown): NormalizedRow[] => {
		const source = asRecord(raw);
		const categories = asArray(source.categoryResults);
		const rows: NormalizedRow[] = [];

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
					check: ruleId || humanizeToken(message),
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

	const normalizeSecurity = (raw: unknown): NormalizedRow[] => {
		const source = asRecord(raw);
		const findings = asArray(source.findings);
		const rows: NormalizedRow[] = [];

		findings.forEach((findingValue, index) => {
			const finding = asRecord(findingValue);
			const severity = mapSecuritySeverity(asString(finding.risk_level, 'info'));
			const group = asString(finding.source, 'security');
			const check = asString(finding.vulnerability, `finding-${index + 1}`);
			const summary = cleanText(asString(finding.description, 'No description available'));
			const value = asString(finding.reference || finding.website || '');

			rows.push({
				id: `security:${group}:${index}`,
				tool: 'security',
				group,
				check,
				status: severityToStatus(severity),
				severity,
				value,
				summary,
				details: compactDetails({
					reference: finding.reference,
					website: finding.website,
					source: finding.source,
					risk_level: finding.risk_level
				})
			});
		});

		return rows;
	};

	const normalizeWcag = (raw: unknown): NormalizedRow[] => {
		const source = asRecord(raw);
		const rows: NormalizedRow[] = [];

		const append = (bucket: 'violations' | 'incomplete' | 'passes', status: RowStatus) => {
			const rules = asArray(source[bucket]);
			rules.forEach((ruleValue, index) => {
				const rule = asRecord(ruleValue);
				const ruleId = asString(rule.id, `${bucket}-${index + 1}`);
				const help = cleanText(asString(rule.help, ''));
				const impact = asString(rule.impact, 'unknown').toLowerCase() || 'unknown';
				const nodes = asArray(rule.nodes);
				const nodeCount = nodes.length;
				const nodePaths = nodes
					.flatMap((node) => asArray(asRecord(node).target).map((target) => asString(target)))
					.filter((target) => target.length > 0);

				rows.push({
					id: `wcag:${bucket}:${ruleId}:${index}`,
					tool: 'wcag',
					group: impact,
					check: ruleId,
					status,
					severity: wcagImpactToSeverity(impact),
					value: `${nodeCount} node${nodeCount === 1 ? '' : 's'}`,
					summary: cleanText(asString(rule.description, help || 'No description available')),
					details: compactDetails({
						help,
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
		append('passes', 'pass');

		return rows;
	};

	const nsToMs = (value: number | null): number | null =>
		value === null ? null : value / 1_000_000;

	const formatMs = (value: number | null): string =>
		value === null ? 'n/a' : `${value.toFixed(2)} ms`;

	const formatPercent = (value: number | null): string =>
		value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;

	const formatNumber = (value: number | null): string =>
		value === null ? 'n/a' : value.toFixed(2);

	const stressLatencyStatus = (ms: number | null, warnMs: number): RowStatus => {
		if (ms === null) return 'info';
		if (ms > warnMs * 2) return 'fail';
		if (ms > warnMs) return 'warn';
		return 'pass';
	};

	const normalizeMail = (raw: unknown): NormalizedRow[] => {
		return collectMailIssues(raw).map((row) => ({
			...row,
			tool: 'mail'
		}));
	};

	const normalizeStress = (raw: unknown): NormalizedRow[] => {
		const source = asRecord(raw);
		const report = asRecord(source.report);
		const config = asRecord(source.config);
		const latencyWarnMs = asNumber(config.latency_warn_ms) ?? 500;
		const errors = asArray(report.errors);
		const successRatio = asNumber(report.success);
		const requests = asNumber(report.requests);
		const throughput = asNumber(report.throughput);
		const statusCodes = asRecord(report.status_codes);
		const latency = asRecord(report.latencies);
		const rows: NormalizedRow[] = [];

		const pushRow = (row: Omit<NormalizedRow, 'id' | 'tool'>, index: number) => {
			rows.push({
				id: `stress:${row.check}:${index}`,
				tool: 'stress',
				...row
			});
		};

		const non2xx = Object.entries(statusCodes).reduce((acc, [code, count]) => {
			const parsedCode = Number.parseInt(code, 10);
			const amount = asNumber(count) ?? 0;
			if (!Number.isFinite(parsedCode)) return acc;
			return parsedCode < 200 || parsedCode > 299 ? acc + amount : acc;
		}, 0);

		const availabilityStatus: RowStatus =
			errors.length > 0
				? 'fail'
				: successRatio !== null && successRatio < 0.95
					? 'fail'
					: successRatio !== null && successRatio < 1
						? 'warn'
						: 'pass';

		pushRow(
			{
				group: 'summary',
				check: 'availability',
				status: availabilityStatus,
				value: formatPercent(successRatio),
				summary: `${errors.length} transport error${errors.length === 1 ? '' : 's'} detected`,
				details: compactDetails({
					success_ratio: successRatio,
					error_count: errors.length,
					errors
				})
			},
			0
		);

		pushRow(
			{
				group: 'summary',
				check: 'requests',
				status: requests && requests > 0 ? 'pass' : 'warn',
				value: requests === null ? 'n/a' : String(requests),
				summary: 'Total requests executed during the test run',
				details: compactDetails({ requests })
			},
			1
		);

		pushRow(
			{
				group: 'summary',
				check: 'throughput',
				status: throughput && throughput > 0 ? 'pass' : 'warn',
				value: throughput === null ? 'n/a' : `${formatNumber(throughput)} rps`,
				summary: 'Observed request throughput',
				details: compactDetails({ throughput })
			},
			2
		);

		const latencyKeys = ['50th', '90th', '95th', '99th', 'max'] as const;
		latencyKeys.forEach((key, index) => {
			const rawLatency = asNumber(latency[key]);
			const latencyMs = nsToMs(rawLatency);
			pushRow(
				{
					group: 'latency',
					check: key === 'max' ? 'latency max' : `latency p${key.replace('th', '')}`,
					status: stressLatencyStatus(latencyMs, latencyWarnMs),
					value: formatMs(latencyMs),
					summary: `Threshold: ${latencyWarnMs} ms warning`,
					details: compactDetails({
						raw_ns: rawLatency,
						threshold_warn_ms: latencyWarnMs
					})
				},
				3 + index
			);
		});

		pushRow(
			{
				group: 'response',
				check: 'status codes',
				status: non2xx > 0 ? 'warn' : 'pass',
				value: Object.entries(statusCodes)
					.map(([code, count]) => `${code}:${asString(count)}`)
					.join(', '),
				summary: non2xx > 0 ? `${non2xx} non-2xx responses detected` : 'All responses are 2xx',
				details: compactDetails({ status_codes: statusCodes, non_2xx_count: non2xx })
			},
			9
		);

		return rows;
	};

	const normalizeRows = (
		activeTool: SupportedTool,
		raw: unknown
	): NormalizedRow[] => {
		switch (activeTool) {
			case 'seo':
				return normalizeSeo(raw);
			case 'security':
				return normalizeSecurity(raw);
			case 'wcag':
				return normalizeWcag(raw);
			case 'stress':
				return normalizeStress(raw);
			case 'mail':
				return normalizeMail(raw);
			default:
				return [];
		}
	};

	const statusClass = (status: RowStatus): string => {
		switch (status) {
			case 'pass':
				return 'bg-emerald-500/12 text-emerald-700 border-emerald-600/30 dark:text-emerald-300';
			case 'warn':
				return 'bg-amber-500/12 text-amber-700 border-amber-600/30 dark:text-amber-300';
			case 'fail':
				return 'bg-red-500/12 text-red-700 border-red-600/30 dark:text-red-300';
			case 'info':
			default:
				return 'bg-slate-500/12 text-slate-700 border-slate-600/30 dark:text-slate-300';
		}
	};

	const severityClass = (severity: RowSeverity): string => {
		switch (severity) {
			case 'critical':
				return 'bg-red-500/12 text-red-700 border-red-600/30 dark:text-red-300';
			case 'high':
				return 'bg-orange-500/12 text-orange-700 border-orange-600/30 dark:text-orange-300';
			case 'medium':
				return 'bg-amber-500/12 text-amber-700 border-amber-600/30 dark:text-amber-300';
			case 'low':
				return 'bg-yellow-500/12 text-yellow-700 border-yellow-600/30 dark:text-yellow-300';
			case 'info':
			default:
				return 'bg-slate-500/12 text-slate-700 border-slate-600/30 dark:text-slate-300';
		}
	};

	const formatDetailValue = (value: unknown): string => {
		if (value === null || value === undefined) return '—';
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);
		if (Array.isArray(value)) {
			if (value.length === 0) return '[]';
			const preview = value.slice(0, 5).map((item) => formatDetailValue(item));
			return value.length > 5
				? `${preview.join(', ')} ... (+${value.length - 5})`
				: preview.join(', ');
		}
		const objectValue = asRecord(value);
		const json = JSON.stringify(objectValue);
		if (!json) return '—';
		return json.length > 220 ? `${json.slice(0, 220)}...` : json;
	};

	const detailEntries = (details: Details | undefined): Array<[string, unknown]> => {
		if (!details) return [];
		return Object.entries(details)
			.filter(([, value]) => !isEmptyDetailValue(value))
			.sort(([a], [b]) => a.localeCompare(b));
	};

	const getNodePaths = (row: NormalizedRow): string[] => {
		if (row.tool !== 'wcag' || !row.details) return [];
		const value = (row.details as Record<string, unknown>).node_paths;
		return asArray(value).map((item) => asString(item)).filter((item) => item.length > 0);
	};

	const rawData = $derived(
		data && typeof data === 'object' ? (data as { raw?: unknown }).raw : null
	);

	const allRows = $derived.by(() => {
		if (!rawData || !isSupportedTool(tool)) return [] as NormalizedRow[];
		return normalizeRows(tool, rawData);
	});

	const availableGroups = $derived.by(() =>
		Array.from(
			new Set(
				allRows
					.map((row) => row.group)
					.filter((group) => typeof group === 'string' && group.trim().length > 0)
			)
		).sort((a, b) => a.localeCompare(b))
	);

	$effect(() => {
		if (groupFilter !== 'all' && !availableGroups.includes(groupFilter)) {
			groupFilter = 'all';
		}
	});

	const statusCounts = $derived.by(() => {
		const counts: Record<StatusFilter, number> = {
			all: allRows.length,
			pass: 0,
			warn: 0,
			fail: 0,
			info: 0
		};

		allRows.forEach((row) => {
			counts[row.status] += 1;
		});

		return counts;
	});

	const statusOrder: Record<RowStatus, number> = {
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

	const sortRows = (rows: NormalizedRow[]): NormalizedRow[] => {
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

	const filteredRows = $derived.by(() => {
		const query = search.trim().toLowerCase();
		const rows = allRows.filter((row) => {
			if (statusFilter !== 'all' && row.status !== statusFilter) return false;
			if (groupFilter !== 'all' && row.group !== groupFilter) return false;
			if (!query) return true;

			const haystack = [
				row.check,
				row.group,
				row.summary,
				row.value ?? '',
				row.severity ?? ''
			]
				.join(' ')
				.toLowerCase();

			return haystack.includes(query);
		});

		return sortRows(rows);
	});

	const statusFilters: Array<{ value: StatusFilter; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'fail', label: 'Fail' },
		{ value: 'warn', label: 'Warn' },
		{ value: 'info', label: 'Info' },
		{ value: 'pass', label: 'Pass' }
	];
</script>

<div class="space-y-3">
	{#if !isSupportedTool(tool)}
		<div class="rounded-md border p-4 text-sm text-muted-foreground">
			Detailed results are not available for tool: <span class="font-medium">{tool}</span>
		</div>
	{:else if !rawData}
		<div class="rounded-md border p-4 text-sm text-muted-foreground">
			No detailed results available.
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<Input
				placeholder="Search checks, groups, summary or value"
				class="w-full md:w-80"
				bind:value={search}
			/>

			{#if availableGroups.length > 1}
            <Select.Root type="single" bind:value={groupFilter}>
                <Select.Trigger class="w-40 capitalize">{groupFilter}</Select.Trigger>
                <Select.Content>
                    <Select.Item value="all">All</Select.Item>
					{#each availableGroups as group (group)}
                    <Select.Item value={group} class="capitalize">{group}</Select.Item>
					{/each}
                </Select.Content>
            </Select.Root>
			{/if}
		</div>

		<div class="flex flex-wrap gap-1">
			{#each statusFilters as option (option.value)}
				<Button
					type="button"
					size="sm"
					variant={statusFilter === option.value ? 'default' : 'outline'}
					onclick={() => {
						statusFilter = option.value;
					}}
				>
					{option.label} ({statusCounts[option.value]})
				</Button>
			{/each}
		</div>

		{#if filteredRows.length === 0}
			<div class="rounded-md border p-4 text-sm text-muted-foreground">
				No matching rows for the current filters.
			</div>
		{:else}
				<Table.Root>
					<Table.Header class="bg-background sticky top-0 z-10">
						<Table.Row>
							<Table.Head>Status</Table.Head>
							<Table.Head>Check</Table.Head>
							<Table.Head>Group</Table.Head>
							<Table.Head>Value</Table.Head>
							<Table.Head>Summary</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filteredRows as row (row.id)}
							<Table.Row>
								<Table.Cell class="align-top">
									<div class="flex flex-wrap gap-1">
										<Badge class={statusClass(row.status)}>{row.status.toUpperCase()}</Badge>
										{#if row.severity}
											<Badge class={severityClass(row.severity)}>{row.severity.toUpperCase()}</Badge>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="font-mono text-xs align-top">{row.check}</Table.Cell>
								<Table.Cell class="capitalize align-top">{row.group}</Table.Cell>
								<Table.Cell class="font-mono text-xs align-top">
									{#if row.score !== undefined && row.score !== null}
										<div class="text-muted-foreground mt-1 text-[11px]">Score: {row.score.toFixed(2)}</div>
									{/if}
									{#if row.tool === 'wcag' && getNodePaths(row).length}
										<details>
											<summary class="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
												Nodes ({getNodePaths(row).length})
											</summary>
											<ul class="mt-1 space-y-1 text-[11px]">
												{#each getNodePaths(row) as nodePath}
													<li class="break-all">{nodePath}</li>
												{/each}
											</ul>
										</details>
                                    {:else}
									    {row.value?.trim().length ? row.value : '—'}
									{/if}
								</Table.Cell>
								<Table.Cell class="align-top">
									<p class="text-sm leading-5 whitespace-normal wrap-break-word">{row.summary}</p>
									{#if detailEntries(row.details).length}
										<details class="mt-2">
											<summary class="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
												Details
											</summary>
											<dl class="mt-2 grid gap-1 text-xs">
												{#each detailEntries(row.details) as [key, value] (`${row.id}:${key}`)}
													<div class="grid grid-cols-[120px_1fr] gap-2 border-b pb-1 last:border-0">
														<dt class="text-muted-foreground font-medium">{humanizeToken(key)}</dt>
														<dd class="wrap-break-word">{formatDetailValue(value)}</dd>
													</div>
												{/each}
											</dl>
										</details>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
		{/if}
	{/if}
</div>
