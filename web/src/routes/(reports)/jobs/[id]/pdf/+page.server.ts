import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { queryOne, withAdminDb } from '$lib/server/db';
import { normalizeToolRows, type NormalizedReportRow } from '$lib/server/report-normalization';
import {
	buildMailTldrLine,
	extractMailDeductionsFromRaw,
	getMailDeductionPointsForRow,
	resolveMailPainPointPriority,
	type MailDeduction
} from '$lib/server/mail-report-helpers';
import { RecordId } from 'surrealdb';
import { toRouteId } from '$lib/server/record-id';
import { techSearch, type Technology } from '$lib/server/wappalyzer';
import { env } from '$env/dynamic/private';
import { mapProbeGeoToSummary } from '$lib/server/geo';
import QRCode from 'qrcode';
import { config } from '$lib/server/config';

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

const toIso = (value: unknown): string => {
	if (!value) return '';
	if (typeof value === 'string') return value;
	return String(value);
};

const daysUntil = (value: unknown): number | null => {
	const date = new Date(toIso(value));
	if (Number.isNaN(date.getTime())) return null;
	const diffMs = date.getTime() - Date.now();
	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const toTechSummary = (value: unknown): Technology[] => {
	return asArray(value)
		.map((item) => asString(item).trim())
		.filter((item) => item.length > 0)
		.map((name) => techSearch(name) ?? { name, description: null, website: null, icon: null });
};

const toRepositoryUrl = (): string => {
	const repo = config.repoUrl;
	const raw = typeof repo === 'string' ? repo : repo?.url ?? '';
	return raw.endsWith('.git') ? raw.slice(0, -4) : raw;
};

const toSecurityThreshold = (): number => {
	const raw = Number.parseFloat(env.SECURITY_SCORE_THRESHOLD ?? '400');
	return Number.isFinite(raw) && raw > 0 ? raw : 400;
};

const buildPainPoints = (params: {
	securityRows: NormalizedReportRow[];
	wcagRows: NormalizedReportRow[];
	seoRows: NormalizedReportRow[];
	stressRows: NormalizedReportRow[];
	mailRows: NormalizedReportRow[];
	mailDeductions: MailDeduction[];
}): PainPoint[] => {
	const points: PainPoint[] = [];

	for (const row of params.securityRows) {
		if (row.status !== 'fail' && row.status !== 'warn') continue;
		const severity = row.severity ?? 'info';
		let priority = 30;
		if (severity === 'critical') priority = 100;
		else if (severity === 'high') priority = 90;
		else if (severity === 'medium') priority = 70;
		else if (severity === 'low') priority = 50;

		points.push({
			title: `Security: ${row.check}`,
			detail: row.summary,
			severity: priority >= 80 ? 'high' : priority >= 50 ? 'medium' : 'low',
			priority
		});
	}

	for (const row of params.wcagRows) {
		if (row.status !== 'fail' && row.status !== 'warn') continue;
		let priority = 45;
		if (row.group === 'serious') priority = 80;
		else if (row.group === 'moderate') priority = 65;
		else if (row.group === 'unknown') priority = 50;

		points.push({
			title: `Accessibility (${row.group}): ${row.check}`,
			detail: row.summary,
			severity: priority >= 75 ? 'high' : priority >= 55 ? 'medium' : 'low',
			priority
		});
	}

	for (const row of params.seoRows) {
		if (row.status !== 'fail' && row.status !== 'warn') continue;
		const priority = row.status === 'fail' ? 55 : 35;
		points.push({
			title: `SEO: ${row.check}`,
			detail: row.summary,
			severity: priority >= 50 ? 'medium' : 'low',
			priority
		});
	}

	for (const row of params.stressRows) {
		if (row.status !== 'fail' && row.status !== 'warn') continue;
		const priority = row.status === 'fail' ? 75 : 45;
		points.push({
			title: `Performance: ${row.check}`,
			detail: row.summary,
			severity: priority >= 70 ? 'high' : 'medium',
			priority
		});
	}

	for (const row of params.mailRows) {
		if (row.status !== 'fail' && row.status !== 'warn') continue;

		const priority = resolveMailPainPointPriority(row, params.mailDeductions);
		const deductionPoints = getMailDeductionPointsForRow(row, params.mailDeductions);
		const detail =
			deductionPoints > 0
				? `${row.summary} (mail deduction: ${deductionPoints} point${deductionPoints === 1 ? '' : 's'})`
				: row.summary;

		points.push({
			title: `Mail (${row.group}): ${row.check}`,
			detail,
			severity: priority >= 80 ? 'high' : priority >= 55 ? 'medium' : 'low',
			priority
		});
	}

	const unique = new Map<string, PainPoint>();
	for (const point of points) {
		const key = `${point.title}::${point.detail}`;
		if (!unique.has(key) || (unique.get(key)?.priority ?? 0) < point.priority) {
			unique.set(key, point);
		}
	}

	return Array.from(unique.values())
		.sort((a, b) => b.priority - a.priority)
		.slice(0, 10);
};

const buildTldr = (params: {
	websiteUrl: string;
	scannedAt: string;
	overallScore: number | null;
	securityRows: NormalizedReportRow[];
	wcagRows: NormalizedReportRow[];
	stressRows: NormalizedReportRow[];
	mailRows: NormalizedReportRow[];
	mailDeductions: MailDeduction[];
	painPoints: PainPoint[];
}): string[] => {
	const lines: string[] = [];

	if (params.overallScore !== null) {
		const score = params.overallScore;
		if (score >= 95) {
			lines.push('Overall quality is excellent! Keep reading to spot any single errors though.');
		} else if (score >= 85) {
			lines.push('Overall quality is strong, with only limited remediation required.');
		} else if (score >= 70) {
			lines.push('Overall quality is good, but targeted improvements are recommended to reduce risk and improve compliance.');
		} else if (score >= 50) {
			lines.push('Overall quality is mixed; multiple areas require remediation before this can be considered production-grade.');
		} else {
			lines.push('Overall quality is weak; immediate remediation is advised for both risk and compliance issues.');
		}
	}

	const securityIssues = params.securityRows.filter((row) => row.status === 'fail' || row.status === 'warn').length;
	const wcagIssues = params.wcagRows.filter((row) => row.status === 'fail' || row.status === 'warn').length;
	lines.push(`Detected ${securityIssues} security findings and ${wcagIssues} accessibility findings that should be reviewed.`);

	const p95 = params.stressRows.find((row) => row.check === 'latency p95');
	if (p95?.value) {
		lines.push(`Observed performance baseline: ${p95.value} at p95 latency during stress testing.`);
	}

	lines.push(buildMailTldrLine(params.mailRows, params.mailDeductions));

	if (params.painPoints.length > 0) {
		lines.push(`Top immediate priority: ${params.painPoints[0]?.title}.`);
	}

	return lines.slice(0, 6);
};

export const load: PageServerLoad = async (event) => {
	const jobRouteId = event.params.id;
	const securityThreshold = toSecurityThreshold();

	const report = await withAdminDb(async (db) => {
		const jobId = new RecordId('jobs', jobRouteId);
		const job = await queryOne<Record<string, unknown>>(
			db,
			"SELECT * FROM jobs WHERE id = $id AND status = 'completed' LIMIT 1 FETCH website, probe, seo, ssl, whois, wcag, domain, security, stress, mail;",
			{ id: jobId }
		);

		if (!job) {
			return null;
		}

		const jobPlain = JSON.parse(JSON.stringify(job)) as Record<string, unknown>;
		const seo = asRecord(jobPlain.seo);
		const security = asRecord(jobPlain.security);
		const stress = asRecord(jobPlain.stress);
		const mail = asRecord(jobPlain.mail);
		const probe = asRecord(jobPlain.probe);
		const ssl = asRecord(jobPlain.ssl);
		const domain = asRecord(jobPlain.domain);
		const whois = asArray(jobPlain.whois).map((item) => asRecord(item));

		const wcagByDevice: WcagDeviceSection[] = [];
		for (const wcagItem of asArray(jobPlain.wcag)) {
			const wcag = asRecord(wcagItem);
			const screenshot = asString(wcag.screenshot);
			let screenshotDataUrl: string | null = screenshot ? `/api/v1/screenshots/${toRouteId(wcag.id)}` : null;

			wcagByDevice.push({
				device: asString(wcag.device, 'Unknown device'),
				score: asNumber(wcag.score),
				passes: asNumber(wcag.passes),
				warnings: asNumber(wcag.warnings),
				errors: asNumber(wcag.errors),
				rows: normalizeToolRows('wcag', wcag.raw, { includeWcagPasses: false }),
				screenshot_data_url: screenshotDataUrl
			});
		}

		const seoRows = normalizeToolRows('seo', seo.raw);
		const securityRows = normalizeToolRows('security', security.raw);
		const stressRows = stress.raw ? normalizeToolRows('stress', stress.raw) : [];
		const mailRows = mail.raw ? normalizeToolRows('mail', mail.raw) : [];
		const mailDeductions = extractMailDeductionsFromRaw(mail.raw);
		const allWcagRows = wcagByDevice.flatMap((item) => item.rows);

		const wcagAverageScore =
			wcagByDevice.length > 0
				? wcagByDevice.reduce((acc, item) => acc + item.score, 0) / wcagByDevice.length
				: null;

		const scoreCards: ScoreCard[] = [];
		if (Object.keys(seo).length) {
			scoreCards.push({
				tool: 'SEO',
				score: asNumber(seo.score),
				passes: asNumber(seo.passes),
				warnings: asNumber(seo.warnings),
				errors: asNumber(seo.errors)
			});
		}
		if (Object.keys(security).length) {
			scoreCards.push({
				tool: 'Security',
				score: asNumber(security.score),
				passes: asNumber(security.passes),
				warnings: asNumber(security.warnings),
				errors: asNumber(security.errors)
			});
		}
		if (Object.keys(stress).length) {
			scoreCards.push({
				tool: 'Stress',
				score: asNumber(stress.score),
				passes: asNumber(stress.passes),
				warnings: asNumber(stress.warnings),
				errors: asNumber(stress.errors)
			});
		}
		if (Object.keys(mail).length) {
			scoreCards.push({
				tool: 'Mail',
				score: asNumber(mail.score),
				passes: asNumber(mail.passes),
				warnings: asNumber(mail.warnings),
				errors: asNumber(mail.errors)
			});
		}
		if (wcagAverageScore !== null) {
			scoreCards.push({
				tool: 'WCAG (avg)',
				score: wcagAverageScore,
				passes: wcagByDevice.reduce((acc, item) => acc + item.passes, 0),
				warnings: wcagByDevice.reduce((acc, item) => acc + item.warnings, 0),
				errors: wcagByDevice.reduce((acc, item) => acc + item.errors, 0)
			});
		}

		const overallScore =
			scoreCards.length > 0
				? scoreCards.reduce((acc, card) => acc + card.score, 0) / scoreCards.length
				: null;

		const painPoints = buildPainPoints({
			securityRows,
			wcagRows: allWcagRows,
			seoRows,
			stressRows,
			mailRows,
			mailDeductions
		});

		const website = asRecord(jobPlain.website);
		const basicInfo = {
			job_id: toRouteId(jobPlain.id),
			website_url: asString(website.url),
			title: asString(probe.title),
			scanned_at: toIso(jobPlain.created_at),
			status: asString(jobPlain.status),
			tools: asArray(jobPlain.types).map((item) => asString(item)).filter(Boolean)
		};

		const tldr = buildTldr({
			websiteUrl: basicInfo.website_url,
			scannedAt: basicInfo.scanned_at,
			overallScore,
			securityRows,
			wcagRows: allWcagRows,
			stressRows,
			mailRows,
			mailDeductions,
			painPoints
		});

		const sslDaysUntilExpiry = daysUntil(ssl.valid_to);
		const domainDaysUntilExpiry = daysUntil(domain.expirationDate);
		let qr = '';

		try {
			// Generates the Base64 string directly
			qr = await QRCode.toDataURL(event.url.toString(), {
				errorCorrectionLevel: 'H',
				margin: 1,
				width: 120
			});

		} catch (err) {
			if (config.debug) console.debug(`Could not generate QR for Job Report ${basicInfo.job_id}: ${(err as Error).message}`);
		}

		return {
			generated_at: new Date().toISOString(),
			basic_info: basicInfo,
			overall_score: overallScore,
			scores: scoreCards,
			tldr,
			pain_points: painPoints,
			infrastructure: {
				probe: {
					title: asString(probe.title),
					server: asString(probe.server),
					response_time: asString(probe.response_time),
					ip: asArray(probe.ipv4)[0] || asArray(probe.ipv6)[0] || '',
					cdn_name: asString(asRecord(probe.cdn).name),
					cdn_type: asString(asRecord(probe.cdn).type),
					geo: mapProbeGeoToSummary(probe.geo)
				},
				ssl: {
					protocol: asString(ssl.protocol),
					valid_from: toIso(ssl.valid_from),
					valid_to: toIso(ssl.valid_to),
					days_until_expiry: sslDaysUntilExpiry,
					owner: asRecord(ssl.owner),
					issuer: asRecord(ssl.issuer)
				},
				whois,
				domain: {
					...domain,
					days_until_expiry: domainDaysUntilExpiry
				}
			},
			tables: {
				seo: seoRows,
				security: securityRows,
				stress: stressRows,
				mail: mailRows,
				wcag_by_device: wcagByDevice
			},
			tech_summary: {
				general: toTechSummary(probe.tech),
				wp_plugins: toTechSummary(probe.wp_plugins),
				wp_themes: toTechSummary(probe.wp_themes)
			},
			footer: {
				hostname: event.url.hostname,
				version: config.version ?? 'unknown',
				repository: toRepositoryUrl(),
				security_score_threshold: securityThreshold,
				credits: [
					'ProjectDiscovery httpx',
					'freeipapi',
					'@seomator/seo-audit',
					'rdapper',
					'ProjectDiscovery nuclei',
					'Wapiti',
					'Nikto',
					'Google Lighthouse',
					'axe-core',
					'tsenart/vegeta',
					'projectdiscovery/subfinder',
					'WHOIS and DNS resolver libraries'
				]
			},
			qr
		};
	});

	if (!report) {
		throw error(404, 'Report not found');
	}

	return { report };
};
