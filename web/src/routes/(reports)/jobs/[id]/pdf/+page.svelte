<script lang="ts">
	import type { NormalizedReportRow } from '$lib/server/report-normalization';
	import * as Table from '$lib/components/ui/table';
  import { asset } from '$app/paths';

	type ScoreCard = {
		tool: string;
		score: number;
		passes: number;
		warnings: number;
		errors: number;
	};

	type PainPoint = {
		title: string;
		detail: string;
		severity: 'high' | 'medium' | 'low';
		priority: number;
	};

	type WcagDeviceSection = {
		device: string;
		score: number;
		passes: number;
		warnings: number;
		errors: number;
		rows: NormalizedReportRow[];
		screenshot_data_url: string | null;
	};

	type TechEntry = {
		name: string;
		description: string | null;
		icon?: string | null;
	};

	type ReportPayload = {
		generated_at: string;
		basic_info: {
			job_id: string;
			website_url: string;
			title?: string;
			scanned_at: string;
			status: string;
			tools: string[];
		};
		overall_score: number | null;
		scores: ScoreCard[];
		tldr: string[];
		pain_points: PainPoint[];
		infrastructure: {
			probe: Record<string, unknown>;
			ssl: Record<string, unknown>;
			whois: Array<Record<string, unknown>>;
			domain: Record<string, unknown>;
		};
		tables: {
			seo: NormalizedReportRow[];
			security: NormalizedReportRow[];
			stress: NormalizedReportRow[];
			wcag_by_device: WcagDeviceSection[];
		};
		tech_summary: {
			general: TechEntry[];
			wp_plugins: TechEntry[];
			wp_themes: TechEntry[];
		};
		footer: {
			hostname: string;
			version: string;
			repository: string;
			security_score_threshold: number;
			credits: string[];
		};
		qr: string;
	};

	let { data }: { data: { report: ReportPayload } } = $props();
	const report = $derived(data.report);

	const asRecord = (value: unknown): Record<string, unknown> =>
		typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};

	const formatDate = (value: string | null | undefined): string => {
		if (!value) return 'N/A';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return String(value);
		return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
	};

	const formatScore = (value: number | null | undefined): string =>
		typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}%` : 'N/A';

	const formatScalar = (value: unknown): string => {
		if (value === null || value === undefined || value === '') return 'N/A';
		if (typeof value === 'string') return value;
		if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : 'N/A';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	};

	const capitalizeWords = (value: string): string =>
		value
			.split(/[\s_-]+/)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
			.join(' ');

	const domainRegistrarName = (domain: Record<string, unknown>): string => {
		const registrar = domain.registrar;
		if (typeof registrar === 'object' && registrar !== null) {
			return formatScalar((registrar as Record<string, unknown>).name);
		}
		return 'N/A';
	};

	const toDetailLines = (details: Record<string, unknown> | undefined): string[] => {
		if (!details) return [];
		return Object.entries(details)
			.filter(([, value]) => value !== null && value !== undefined && value !== '')
			.map(([key, value]) => {
				if (Array.isArray(value)) {
					return `${key}: ${value.map((item) => formatScalar(item)).join(', ')}`;
				}
				if (typeof value === 'object') {
					return `${key}: ${formatScalar(value)}`;
				}
				return `${key}: ${formatScalar(value)}`;
			});
	};

	const statusClass = (status: string): string => {
		switch (status) {
			case 'fail':
				return 'status-fail';
			case 'warn':
				return 'status-warn';
			case 'pass':
				return 'status-pass';
			default:
				return 'status-info';
		}
	};

	const severityClass = (severity: 'high' | 'medium' | 'low'): string => {
		switch (severity) {
			case 'high':
				return 'severity-high';
			case 'medium':
				return 'severity-medium';
			default:
				return 'severity-low';
		}
	};

	const scoreBandClass = (score: number | null | undefined): string => {
		const value = typeof score === 'number' && Number.isFinite(score) ? score : 0;
		if (value >= 95) return 'score-green';
		if (value >= 85) return 'score-lime';
		if (value >= 70) return 'score-yellow';
		if (value >= 50) return 'score-orange';
		return 'score-red';
	};

	const barWidth = (score: number): string =>
		`${Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0)).toFixed(2)}%`;

	const formatResponseTime = (value: unknown): string => {
		const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
		return Number.isFinite(numeric) ? `${numeric.toFixed(2)} ms` : formatScalar(value);
	};

	const isEnabled = (value: unknown, label = false): boolean | string => {
		if (typeof value === 'boolean') {
			if(value) {
				return label ? 'Enabled' : true;
			} else {
				return label ? 'Disabled' : false;
			}
		}			
		if (typeof value === 'number') {
			if (value === 1) {
				return label ? 'Enabled' : true;
			} else {
				return label ? 'Disabled' : false;
			}
		}
		if (typeof value === 'string') {
			if (['true', '1', 'yes', 'enabled'].includes(value.toLowerCase())) {
				return label ? 'Enabled' : true;
			} else {
				return label ? 'Disabled' : false;
			}
		}
		return label ? 'N/A' : false;
	};

	const cdnFieldLabel = (cdnType: unknown): string =>
		String(cdnType ?? '').toUpperCase() === 'WAF' ? 'CDN/WAF' : 'CDN';

	type DnsRow = { type: string; name: string; value: string };

	const dnsRows = $derived.by<DnsRow[]>(() => {
		const rows: DnsRow[] = [];
		const records = report.infrastructure.domain.records;
		if (!records || typeof records !== 'object' || Array.isArray(records)) return rows;
		for (const [recordType, hosts] of Object.entries(records as Record<string, unknown>)) {
			if (!hosts || typeof hosts !== 'object' || Array.isArray(hosts)) continue;
			for (const [host, values] of Object.entries(hosts as Record<string, unknown>)) {
				if (!Array.isArray(values)) continue;
				for (const value of values) {
					if (typeof value === 'string') {
						rows.push({ type: recordType.toUpperCase(), name: host, value });
					} else if (value && typeof value === 'object') {
						const obj = value as Record<string, unknown>;
						rows.push({
							type: recordType.toUpperCase(),
							name: host,
							value: `exchange=${formatScalar(obj.exchange)}, priority=${formatScalar(obj.priority)}`
						});
					}
				}
			}
		}
		return rows.sort((a, b) => {
			const typeDiff = a.type.localeCompare(b.type);
			if (typeDiff !== 0) return typeDiff;
			return a.name.localeCompare(b.name);
		});
	});

	const techColumns = $derived.by(() => {
		const source = report.tech_summary ?? { general: [], wp_plugins: [], wp_themes: [] };
		return [
			{ key: 'general', title: 'General', items: source.general ?? [] },
			{ key: 'wp_plugins', title: 'WordPress Plugins', items: source.wp_plugins ?? [] },
			{ key: 'wp_themes', title: 'WordPress Themes', items: source.wp_themes ?? [] }
		].filter((column) => Array.isArray(column.items) && column.items.length > 0);
	});

	const iconSrc = (icon: string): string => `/wappalyzer/${encodeURIComponent(icon)}`;
</script>

<svelte:head>
	<title>Hesperida Report - {report.basic_info.website_url}</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<table class="report border-separate" cellspacing="16px">
	<thead class="section cover">
		<tr class="cover-top mb-2">
			<td class="brand-row">
				<img src={asset('/hesperida-logo.svg')} class="max-h-30 w-auto self-start" alt="Hesperida Web Scanner" />
				<div>
					<p class="brand-name">Hesperida</p>
					<p class="brand-subtitle">Web Quality & Security Assessment</p>
					<h1>Website Audit Report</h1>
					<p class="muted">Generated: {formatDate(report.generated_at)}</p>
				</div>
			</td>
			<td class="qr">
				{#if report.qr.length}
				<img src={report.qr} alt="qr_code" />
				{/if}
			</td>
			<td class="overall-header">
				<p class="label">Overall Score</p>
				<p class={`score-value ${scoreBandClass(report.overall_score)}`}>{formatScore(report.overall_score)}</p>
			</td>
		</tr>
	</thead>
	<tbody>
	<tr class="section"><td>
		<h2>Basic Information</h2>
		<div class="info-grid">
			<div><span class="label">Website</span><span>{report.basic_info.website_url || 'N/A'}</span></div>
			<div><span class="label">Job ID</span><span>{report.basic_info.job_id || 'N/A'}</span></div>
			<div><span class="label">Title</span><span>{report.basic_info.title || 'N/A'}</span></div>
			<div><span class="label">Scanned At</span><span>{formatDate(report.basic_info.scanned_at)}</span></div>
			<div class="tools">
				<span class="label">Tools Used</span>
				<span class="tool-badges">
					{#if report.basic_info.tools.length}
						{#each report.basic_info.tools as tool (`basic-tool-${tool}`)}
							{#if tool !== 'probe'}
							<span class="badge status-info">{capitalizeWords(tool)}</span>
							{/if}
						{/each}
					{:else}
						<span>N/A</span>
					{/if}
				</span>
			</div>
		</div>
	</td></tr>

	<tr class="section"><td>
		<h2>Score Summary</h2>
		<div class="score-grid">
			{#each report.scores as score (score.tool)}
				<div class="score-card">
					<p class="score-title">{score.tool}</p>
					<p class="score-value">{formatScore(score.score)}</p>
					<div class="progress-track">
						<div class={`progress-fill ${scoreBandClass(score.score)}`} style={`width: ${barWidth(score.score)};`}></div>
					</div>
					<p class="score-meta">{score.tool.toLowerCase() !== 'security' ? `Passes ${score.passes} · `: ''}Warnings {score.warnings} · Errors {score.errors}</p>
				</div>
			{/each}
		</div>
	</td></tr>

	<tr class="section"><td>
		<h2>TL;DR</h2>
		<ul class="list tldr-list">
			{#each report.tldr as line, index (`${index}-${line}`)}
				<li>{line}</li>
			{/each}
		</ul>
	</td></tr>

	<tr class="section"><td>
		<h2>Top Pain Points</h2>
		{#if report.pain_points.length === 0}
			<p class="muted">No high-priority pain points were detected.</p>
		{:else}
			<Table.Root class="overflow-x-clip">
				<Table.Header>
					<Table.Row>
						<Table.Head>Severity</Table.Head>
						<Table.Head>Issue</Table.Head>
						<Table.Head>Details</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each report.pain_points as point (`${point.title}-${point.priority}`)}
						<Table.Row>
							<Table.Cell><span class={`badge ${severityClass(point.severity)}`}>{point.severity}</span></Table.Cell>
							<Table.Cell>{point.title}</Table.Cell>
							<Table.Cell class="whitespace-break-spaces break-all">{point.detail}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</td></tr>

	<tr class="section"><td>
		<h2>Infrastructure Summary</h2>
		<div class="infra-grid">
			<article class="infra-card">
				<h3>Probe</h3>
				<ul>
					<li><strong>Server:</strong> {capitalizeWords(formatScalar(report.infrastructure.probe.server))}</li>
					<li><strong>Response Time:</strong> {formatResponseTime(report.infrastructure.probe.response_time)}</li>
					<li>
						<strong>{cdnFieldLabel(report.infrastructure.probe.cdn_type)}:</strong>
						{capitalizeWords(formatScalar(report.infrastructure.probe.cdn_name))}
					</li>
					<li><strong>Geo City:</strong> {formatScalar(asRecord(report.infrastructure.probe.geo).city)}</li>
					<li>
						<strong>Geo Country:</strong>
						{formatScalar(asRecord(report.infrastructure.probe.geo).countryName)}
						({formatScalar(asRecord(report.infrastructure.probe.geo).countryCode)})
					</li>
					<li><strong>Geo ZIP:</strong> {formatScalar(asRecord(report.infrastructure.probe.geo).zip)}</li>
				</ul>
			</article>
			<article class="infra-card">
				<h3>SSL</h3>
				<ul>
					<li><strong>Protocol:</strong> {formatScalar(report.infrastructure.ssl.protocol)}</li>
					<li><strong>Valid From:</strong> {formatDate(formatScalar(report.infrastructure.ssl.valid_from))}</li>
					<li><strong>Valid To:</strong> {formatDate(formatScalar(report.infrastructure.ssl.valid_to))}</li>
					<li><strong>Days Until Expiry:</strong> {formatScalar(report.infrastructure.ssl.days_until_expiry)}</li>
					<li><strong>Issuer:</strong> {formatScalar(asRecord(report.infrastructure.ssl.issuer).name)}</li>
					<li><strong>Certified Domain:</strong> {formatScalar(asRecord(report.infrastructure.ssl.owner).domain)}</li>
				</ul>
			</article>
			<article class="infra-card">
				<h3>Domain</h3>
				<ul>
					<li><strong>Domain:</strong> {formatScalar(report.infrastructure.domain.domain)}</li>
					<li><strong>Registrar:</strong> {domainRegistrarName(report.infrastructure.domain)}</li>
					<li><strong>Creation:</strong> {formatDate(formatScalar(report.infrastructure.domain.creationDate))}</li>
					<li><strong>Expiry:</strong> {formatDate(formatScalar(report.infrastructure.domain.expirationDate))}</li>
					<li><strong>Days Until Expiry:</strong> {formatScalar(report.infrastructure.domain.days_until_expiry)}</li>
					<li>
						<strong>DNSSEC:</strong>
						<span class={`badge align-text-bottom ${isEnabled(report.infrastructure.domain.dnssecEnabled) ? 'status-pass' : 'status-fail'}`}>
							{isEnabled(report.infrastructure.domain.dnssecEnabled, true)}
						</span>
					</li>
					<li>
						<strong>Privacy:</strong>
						<span class={`badge align-text-bottom ${isEnabled(report.infrastructure.domain.privacyEnabled) ? 'status-pass' : 'status-fail'}`}>
							{isEnabled(report.infrastructure.domain.privacyEnabled, true)}
						</span>
					</li>
					<li>
						<strong>Transfer Lock:</strong>
						<span class={`badge align-text-bottom ${isEnabled(report.infrastructure.domain.transferLock) ? 'status-pass' : 'status-fail'}`}>
							{isEnabled(report.infrastructure.domain.transferLock, true)}
						</span>
					</li>
				</ul>
			</article>
		</div>
	</td></tr>

	{#if techColumns.length > 0}
		<tr class="section"><td>
			<h2>Tech Summary</h2>
			<div class="tech-grid">
				{#each techColumns as column (`tech-col-${column.key}`)}
					<article class="tech-card">
						<h3>{column.title}</h3>
						<ul>
							{#each column.items as item (`${column.key}-${item.name}`)}
								<li>
									{#if item.icon}
										<img class="tech-icon" src={iconSrc(item.icon)} alt={item.name} />
									{/if}
									<strong>{item.name}:</strong>
									{item.description?.trim() || 'No description available'}
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		</td></tr>
	{/if}

	<tr class="section"><td>
		<h2>Whois Records</h2>
		{#if report.infrastructure.whois.length === 0}
			<p class="muted">No whois records were collected.</p>
		{:else}
			<Table.Root class="overflow-x-clip">
				<Table.Header>
					<Table.Row>
						<Table.Head>IP</Table.Head>
						<Table.Head>Country</Table.Head>
						<Table.Head>Network</Table.Head>
						<Table.Head>AS</Table.Head>
						<Table.Head>Registry</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each report.infrastructure.whois as row, index (`whois-${index}`)}
						<Table.Row>
							<Table.Cell>{formatScalar(row.ip)}</Table.Cell>
							<Table.Cell>{formatScalar(row.country)}</Table.Cell>
							<Table.Cell>{formatScalar(row.network)}</Table.Cell>
							<Table.Cell>{formatScalar(row.as)}</Table.Cell>
							<Table.Cell>{formatScalar(row.registry)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</td></tr>

	<tr class="section"><td>
		<h2>DNS Records</h2>
		{#if dnsRows.length === 0}
			<p class="muted">No DNS records were collected.</p>
		{:else}
			<Table.Root class="overflow-x-clip">
				<Table.Header>
					<Table.Row>
						<Table.Head>Type</Table.Head>
						<Table.Head>Name</Table.Head>
						<Table.Head>Value</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each dnsRows as row (`dns-${row.type}-${row.name}-${row.value}`)}
						<Table.Row>
							<Table.Cell>{row.type}</Table.Cell>
							<Table.Cell class="mono">{row.name}</Table.Cell>
							<Table.Cell class="mono whitespace-break-spaces break-all">{row.value}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</td></tr>

	{#if report.tables.wcag_by_device.length > 0}
		<tr class="section page-break"><td>
			<h2>WCAG Evidence by Device</h2>
			{#each report.tables.wcag_by_device as wcag (`wcag-${wcag.device}`)}
				<article class="device-section">
					<header class="device-header">
						<h3>{wcag.device}</h3>
						<p class="muted">
							Score {formatScore(wcag.score)} · Passes {wcag.passes} · Warnings {wcag.warnings} · Errors {wcag.errors}
						</p>
					</header>
					{#if wcag.screenshot_data_url}
						<img class="wcag-shot" src={wcag.screenshot_data_url} alt={`WCAG screenshot (${wcag.device})`} />
					{/if}
					<Table.Root class="overflow-x-clip">
						<Table.Header>
							<Table.Row>
								<Table.Head>Status</Table.Head>
								<Table.Head>Group</Table.Head>
								<Table.Head>Check</Table.Head>
								<Table.Head>Value</Table.Head>
								<Table.Head>Summary</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each wcag.rows as row (row.id)}
								<Table.Row>
									<Table.Cell><span class={`badge ${statusClass(row.status)}`}>{row.status}</span></Table.Cell>
									<Table.Cell>{row.group}</Table.Cell>
									<Table.Cell>{row.check}</Table.Cell>
									<Table.Cell class="mono">{row.value || 'N/A'}</Table.Cell>
									<Table.Cell class="mono whitespace-break-spaces break-all">
										<div>{row.summary}</div>
										{#if toDetailLines(row.details).length}
											<ul class="details">
												{#each toDetailLines(row.details) as detail (`${row.id}-${detail}`)}
													<li>{detail}</li>
												{/each}
											</ul>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</article>
			{/each}
		</td></tr>
	{/if}

	{#if report.tables.security.length > 0}
		<tr class="section page-break"><td>
			<h2>Security Findings</h2>
			<Table.Root class="overflow-x-clip">
				<Table.Header>
					<Table.Row>
						<Table.Head>Status</Table.Head>
						<Table.Head>Group</Table.Head>
						<Table.Head>Check</Table.Head>
						<Table.Head>Value</Table.Head>
						<Table.Head>Summary</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each report.tables.security as row (row.id)}
						<Table.Row>
							<Table.Cell><span class={`badge ${statusClass(row.status)}`}>{row.status}</span></Table.Cell>
							<Table.Cell>{row.group}</Table.Cell>
							<Table.Cell>{row.check}</Table.Cell>
							<Table.Cell class="mono">{row.value || 'N/A'}</Table.Cell>
							<Table.Cell class="mono whitespace-break-spaces break-all">
								<div>{row.summary}</div>
								{#if toDetailLines(row.details).length}
									<ul class="details">
										{#each toDetailLines(row.details) as detail (`${row.id}-${detail}`)}
											<li>{detail}</li>
										{/each}
									</ul>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</td></tr>
	{/if}

	{#if report.tables.seo.length > 0}
		<tr class="section page-break"><td>
			<h2>SEO Findings</h2>
			<Table.Root class="overflow-x-clip">
				<Table.Header>
					<Table.Row>
						<Table.Head>Status</Table.Head>
						<Table.Head>Group</Table.Head>
						<Table.Head>Check</Table.Head>
						<Table.Head>Value</Table.Head>
						<Table.Head>Summary</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each report.tables.seo as row (row.id)}
						<Table.Row>
							<Table.Cell><span class={`badge ${statusClass(row.status)}`}>{row.status}</span></Table.Cell>
							<Table.Cell>{row.group}</Table.Cell>
							<Table.Cell>{row.check}</Table.Cell>
							<Table.Cell class="mono whitespace-break-spaces break-word">{row.value || 'N/A'}</Table.Cell>
							<Table.Cell class="mono whitespace-break-spaces break-all">
								<div>{row.summary}</div>
								{#if toDetailLines(row.details).length}
									<ul class="details">
										{#each toDetailLines(row.details) as detail (`${row.id}-${detail}`)}
											<li>{detail}</li>
										{/each}
									</ul>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</td></tr>
	{/if}

	{#if report.tables.stress.length > 0}
		<tr class="section page-break"><td>
			<h2>Performance (Stress) Findings</h2>
			<Table.Root class="overflow-x-clip">
				<Table.Header>
					<Table.Row>
						<Table.Head>Status</Table.Head>
						<Table.Head>Group</Table.Head>
						<Table.Head>Check</Table.Head>
						<Table.Head>Value</Table.Head>
						<Table.Head>Summary</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each report.tables.stress as row (row.id)}
						<Table.Row>
							<Table.Cell><span class={`badge ${statusClass(row.status)}`}>{row.status}</span></Table.Cell>
							<Table.Cell>{row.group}</Table.Cell>
							<Table.Cell>{row.check}</Table.Cell>
							<Table.Cell class="mono">{row.value || 'N/A'}</Table.Cell>
							<Table.Cell class="mono whitespace-break-spaces break-all">
								<div>{row.summary}</div>
								{#if toDetailLines(row.details).length}
									<ul class="details">
										{#each toDetailLines(row.details) as detail (`${row.id}-${detail}`)}
											<li>{detail}</li>
										{/each}
									</ul>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</td></tr>
	{/if}
	</tbody>
	<tfoot class="report-footer fine-print">
		<tr>
			<td>
				<div class="flex justify-between">
					<p><strong>Hesperida Host:</strong> {report.footer.hostname}</p>
					<p><strong>Hesperida Version:</strong> {report.footer.version}</p>
					<p><strong>Hesperida Repo:</strong> {report.footer.repository || 'N/A'}</p>
					<p><strong>Security Score Threshold:</strong> {report.footer.security_score_threshold}</p>
				</div>
			</td>
		</tr>
	</tfoot>
</table>

<style>
	:global(body) {
		background: #fff;
		color: #111827;
	}

	.report {
		max-width: 1100px;
		margin: 0 auto;
		padding: 24px;
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
		line-height: 1.4;
	}

	.section {
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		margin-bottom: 16px;
		break-inside: avoid;
	}


	.section.cover > tr {
		padding: 16px;
		border: 1px solid #e5e7eb;
    	border-radius: 8px;
	}

	.section > td {
		padding: 16px;
		border: 1px solid #e5e7eb;
    	border-radius: 8px;
	}

	.cover {
		border: 1.5px solid #111827;
	}

	.cover-top {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		align-items: flex-start;
	}

	.overall-header {
		text-align: right;
	}

	.overall-header > .score-value {
		background: none!important;
	}

	.brand-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.brand-mark {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		background: #111827;
		color: #fff;
		font-weight: 700;
		border-radius: 6px;
	}

	.brand-name {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.brand-subtitle {
		margin: 0;
		font-size: 0.85rem;
		color: #4b5563;
	}

	h1 {
		margin: 12px 0 8px;
		font-size: 1.75rem;
	}

	h2 {
		margin: 0 0 12px;
		font-size: 1.25rem;
	}

	h3 {
		margin: 0 0 8px;
		font-size: 1rem;
	}

	.info-grid {
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.info-grid > div {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.info-grid > .tools {
		grid-column: 1 / -1;
	}

	.tool-badges {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #6b7280;
	}

	.score-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 10px;
	}

	.score-card {
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 12px;
	}

	.score-title {
		margin: 0;
		font-size: 0.8rem;
		color: #4b5563;
		text-transform: uppercase;
	}

	.score-value {
		margin: 4px 0;
		font-size: 1.35rem;
		font-weight: 700;
	}

	.score-meta {
		margin: 8px 0 0;
		font-size: 0.8rem;
		color: #4b5563;
	}

	.progress-track {
		height: 8px;
		background: #e5e7eb;
		border-radius: 999px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
	}

	.score-red {
		background: #dc2626;
		color: #dc2626;
	}

	.score-orange {
		background: #ea580c;
		color: #ea580c;
	}

	.score-yellow {
		background: #ca8a04;
		color: #ca8a04;
	}

	.score-lime {
		background: #beda68;
		color: #beda68;
	}

	.score-green {
		background: #16a34a;
		color: #16a34a;
	}

	.list {
		margin: 0;
		padding-left: 20px;
		display: grid;
		gap: 6px;
	}

	.tldr-list {
		list-style: disc !important;
		list-style-position: outside;
		padding-left: 22px;
	}

	.infra-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 10px;
	}

	.infra-card {
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 10px;
	}

	.infra-card ul {
		margin: 0;
		display: grid;
		gap: 4px;
	}

	.tech-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 10px;
	}

	.tech-card {
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 10px;
	}

	.tech-card ul {
		margin: 0;
		display: grid;
		gap: 6px;
	}

	.tech-icon {
		width: 16px;
		height: 16px;
		flex: 0 0 16px;
		object-fit: contain;
		display: inline;
    	vertical-align: baseline;
	}

	.muted {
		color: #4b5563;
		font-size: 0.9rem;
		margin: 0;
	}

	:global(.report table[data-slot="table"]) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.84rem;
	}

	:global(.report table[data-slot="table"] th),
	:global(.report table[data-slot="table"] td) {
		border: 1px solid #e5e7eb;
		padding: 6px 8px;
		text-align: left;
		vertical-align: top;
	}

	:global(.report table[data-slot="table"] thead th) {
		background: #f9fafb;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.status-pass {
		background: #dcfce7;
		color: #166534;
	}

	.status-warn {
		background: #fef3c7;
		color: #92400e;
	}

	.status-fail {
		background: #fee2e2;
		color: #991b1b;
	}

	.status-info {
		background: #e5e7eb;
		color: #374151;
	}

	.severity-high {
		background: #fee2e2;
		color: #991b1b;
	}

	.severity-medium {
		background: #fef3c7;
		color: #92400e;
	}

	.severity-low {
		background: #e0f2fe;
		color: #075985;
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
		font-size: 0.78rem;
	}

	.details {
		margin: 8px 0 0;
		padding-left: 16px;
		display: grid;
		gap: 3px;
		font-size: 0.76rem;
		color: #374151;
		word-break: break-all;
	}

	.device-section + .device-section {
		margin-top: 18px;
	}

	.device-header {
		margin-bottom: 8px;
	}

	.wcag-shot {
		width: 100%;
		max-width: 960px;
		height: auto;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		margin: 0 auto 10px auto;
	}

	@media print {
		.wcag-shot {
			max-height: 900px;
			width: auto;
		}
	}

	.page-break {
		break-before: page;
	}

	.report-footer {
		border-top: 1px solid #d1d5db;
		padding-top: 10px;
		margin-top: 12px;
	}

	.fine-print {
		font-size: 0.72rem;
		color: #4b5563;
		line-height: 1.35;
	}

	.fine-print p {
		margin: 2px 0;
	}

	:global(.dark .text-foreground) {
		color: var(--background);
	}

	@media print {
		@page {
			size: A4;
			margin: 14mm;
		}

		.report {
			max-width: none;
			padding: 0;
			font-size: 11px;
		}

		.section {
			margin-bottom: 10px;
			padding: 10px;
		}

		.page-break {
			break-before: page;
		}

		.fine-print {
			font-size: 9px;
		}
	}
</style>
