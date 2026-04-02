import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { RecordId, Surreal, Table, type Values } from "surrealdb";

type RiskLevel = "info" | "low" | "medium" | "high" | "critical";
type Scanner = "nuclei" | "wapiti" | "nikto";
const severityRank: Record<RiskLevel, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const thresholdInput = Number.parseFloat(Bun.env.SECURITY_SCORE_THRESHOLD ?? "400");
const THRESHOLD = Number.isFinite(thresholdInput) && thresholdInput > 0 ? thresholdInput : 400;

interface SecurityFinding {
    source: Scanner;
    website: string;
    vulnerability: string;
    risk_level: RiskLevel;
    description: string;
    reference: string | null;
}

interface SecurityResultRecord {
    job: RecordId<"jobs">;
    score: number;
    passes: number;
    warnings: number;
    errors: number;
    raw: {
        generated_at: string;
        findings: SecurityFinding[];
        summary: {
            total: number;
            critical: number;
            high: number;
            medium: number;
            low: number;
            info: number;
            by_scanner: {
                nuclei: number;
                wapiti: number;
                nikto: number;
            };
        };
        command_status: {
            nuclei: number;
            wapiti: number;
            nikto: number;
        };
        config: {
            target: string;
            nuclei_templates: string[];
            nikto_timeout_seconds: number;
        };
        debug?: {
            findings_before_dedupe: number;
            findings_after_dedupe: number;
            dropped_duplicates: number;
        };
    };
}

const DEBUG = Bun.env.DEBUG === "true";
const rawTarget = Bun.argv[2];
const rawJobId = Bun.argv[3];

if (!rawTarget) throw new Error("Target parameter missing!");
if (!rawJobId) throw new Error("Job ID parameter missing!");

const target = rawTarget;
const jobId = rawJobId;

function sanitizeUrl(input: string): string {
    const candidate = input.startsWith("http://") || input.startsWith("https://") ? input : `https://${input}`;
    return new URL(candidate).toString().replace(/\/$/, "");
}

function normalizeSeverity(input: string | undefined | null): RiskLevel {
    const value = (input ?? "").toLowerCase();
    if (value === "critical" || value === "high" || value === "medium" || value === "low" || value === "info") {
        return value;
    }
    return "low";
}

async function loadJson(filePath: string): Promise<unknown> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;

    try {
        return (await file.json()) as unknown;
    } catch {
        return null;
    }
}

async function loadJsonLines(filePath: string): Promise<unknown[]> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return [];

    const content = (await file.text()).trim();
    if (!content.length) return [];

    const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
    const parsed: unknown[] = [];

    for (const line of lines) {
        try {
            parsed.push(JSON.parse(line) as unknown);
        } catch {
            if (DEBUG) console.warn(`Skipping invalid JSONL line in ${basename(filePath)}.`);
        }
    }

    return parsed;
}

async function runCommand(args: string[], timeoutSeconds = 0): Promise<{ timedOut: boolean; exitCode: number }> {
    if (DEBUG) console.debug(`Running command: ${args.join(" ")}`);

    const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
    });

    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeoutSeconds > 0) {
        timeoutId = setTimeout(() => {
            timedOut = true;
            proc.kill();
        }, timeoutSeconds * 1000);
    }

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    if (timeoutId) clearTimeout(timeoutId);

    /* not helpful
    if (DEBUG) {
        if (stdout.trim().length) console.debug(stdout.trim());
        if (stderr.trim().length) console.debug(stderr.trim());
    }
    */
    return { timedOut, exitCode };
}

function parseNuclei(rows: unknown[], findings: SecurityFinding[]) {
    for (const entry of rows) {
        const data = entry as unknown as Record<string, unknown>;
        const info = (data.info ?? {}) as Record<string, unknown>;
        const severity = normalizeSeverity(info.severity as string | undefined);
        findings.push({
            source: "nuclei",
            website: String(data.host ?? "unknown"),
            vulnerability: String(info.name ?? "unknown"),
            risk_level: severity,
            description: String(info.description ?? "No description available"),
            reference: typeof data.matched === "string" ? data.matched : null,
        });
    }
}

function parseWapiti(wapitiRaw: unknown, findings: SecurityFinding[]) {
    if (!wapitiRaw || Array.isArray(wapitiRaw) || typeof wapitiRaw !== "object") return;

    const data = wapitiRaw as unknown as Record<string, unknown>;
    const targetWebsite = String((data.infos as Record<string, unknown> | undefined)?.target ?? "unknown");
    const vulnerabilities = (data.vulnerabilities ?? {}) as Record<string, unknown>;

    for (const [vulnType, details] of Object.entries(vulnerabilities)) {
        if (!Array.isArray(details)) continue;

        for (const detail of details) {
            const item = (detail ?? {}) as Record<string, unknown>;
            const level = Number(item.level ?? 0);
            const severity: RiskLevel =
                level >= 4 ? "critical" : level >= 3 ? "high" : level >= 2 ? "medium" : level >= 1 ? "low" : "info";

            findings.push({
                source: "wapiti",
                website: targetWebsite,
                vulnerability: vulnType || "unknown",
                risk_level: severity,
                description: String(item.info ?? "No description available"),
                reference: typeof item.path === "string" ? item.path : null,
            });
        }
    }
}

function parseNikto(niktoRaw: unknown, website: string, findings: SecurityFinding[]) {
    if (!niktoRaw || Array.isArray(niktoRaw) || typeof niktoRaw !== "object") return;

    const data = niktoRaw as unknown as Record<string, unknown>;
    const vulnerabilities = (data.vulnerabilities ?? []) as Record<string, unknown>[];
    for (const vuln of vulnerabilities) {
        findings.push({
            source: "nikto",
            website,
            vulnerability: String(vuln.id ?? "unknown"),
            risk_level: "medium",
            description: String(vuln.msg ?? "No description available"),
            reference: typeof vuln.url === "string" ? vuln.url : null,
        });
    }
}

function calculateScore(counters: Record<RiskLevel, number>, errors: number, warnings: number): number {
    if (errors === 0 && warnings === 0) return 100;

    const penalty =
        counters.critical * 10 +
        counters.high * 7 +
        counters.medium * 3 +
        counters.low;

    if (penalty >= THRESHOLD) return 0;
    return Number((100 - ((penalty * 100) / THRESHOLD)).toFixed(2));
}

function parseTemplateInput(input: string): string[] {
    return input
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean);
}

function normalizeText(input: string | null | undefined): string {
    return (input ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function tuneSeverity(finding: SecurityFinding): RiskLevel {
    const vulnerability = normalizeText(finding.vulnerability);
    const description = normalizeText(finding.description);

    if (finding.source === "nuclei") {
        if (vulnerability === "http missing security headers" || vulnerability === "missing subresource integrity") {
            return "low";
        }
        if (
            vulnerability.includes("detection") ||
            vulnerability.includes("record") ||
            vulnerability.includes("robots.txt") ||
            vulnerability.includes("issuer") ||
            vulnerability.includes("ssl dns names")
        ) {
            return "info";
        }
    }

    if (finding.source === "wapiti" && vulnerability === "tls/ssl misconfigurations") {
        if (description.includes("openssl ccs")) return "medium";
        if (description.includes("strict transport security") || description.includes("secure renegotiations")) return "low";
        if (
            description.includes("certificate transparency") ||
            description.includes("extended validation") ||
            description.includes("ocsp must-staple") ||
            description.includes("acceptable for tlsv1.2")
        ) {
            return "info";
        }
    }

    return finding.risk_level;
}

function dedupeFindings(findings: SecurityFinding[]): SecurityFinding[] {
    const deduped = new Map<string, SecurityFinding>();

    for (const finding of findings) {
        const tuned: SecurityFinding = {
            ...finding,
            risk_level: tuneSeverity(finding),
        };

        // Deduplicate noisy repeats (same source + vulnerability + reference + description).
        const key = [
            tuned.source,
            normalizeText(tuned.vulnerability),
            normalizeText(tuned.reference),
            normalizeText(tuned.description),
        ].join("|");

        const existing = deduped.get(key);
        if (!existing || severityRank[tuned.risk_level] > severityRank[existing.risk_level]) {
            deduped.set(key, tuned);
        }
    }

    return [...deduped.values()];
}

async function main() {
    const website = sanitizeUrl(target);
    const jobKey = jobId.split(":")[1];
    if (!jobKey) throw new Error(`Invalid job ID format: ${jobId}`);

    const jobRecordId = new RecordId("jobs", jobKey);
    const workDir = join("/tmp", "security", jobKey);
    await mkdir(workDir, { recursive: true });

    const nucleiOutput = join(workDir, "nuclei_scan.jsonl");
    const wapitiOutput = join(workDir, "wapiti_scan.json");
    const niktoOutput = join(workDir, "nikto_scan.json");

    const nucleiTemplates = parseTemplateInput(Bun.env.SECURITY_NUCLEI_TEMPLATES ?? "");
    const nucleiArgs = ["nuclei", "-target", website, "-jsonl", "-o", nucleiOutput];
    if (nucleiTemplates.length) {
        for (const template of nucleiTemplates) {
            nucleiArgs.push("-t", template);
        }
    }

    const niktoTimeout = Number.parseInt(Bun.env.SECURITY_NIKTO_TIMEOUT ?? "900", 10);
    const [nucleiRun, wapitiRun, niktoRun] = await Promise.all([
        runCommand(nucleiArgs),
        runCommand(["wapiti", "-u", website, "-o", wapitiOutput, "-f", "json"]),
        runCommand(["nikto", "-h", website, "-Tuning", "124356bc", "-Format", "json", "-o", niktoOutput], niktoTimeout),
    ]);

    if (niktoRun.timedOut && DEBUG) {
        console.warn(`Nikto timed out after ${niktoTimeout} seconds.`);
    }

    const findings: SecurityFinding[] = [];
    const nucleiRaw = await loadJsonLines(nucleiOutput);
    const wapitiRaw = await loadJson(wapitiOutput);
    const niktoRaw = await loadJson(niktoOutput);

    parseNuclei(nucleiRaw, findings);
    parseWapiti(wapitiRaw, findings);
    parseNikto(niktoRaw, website, findings);

    const findingsBeforeDedupe = findings.length;
    const tunedFindings = dedupeFindings(findings);
    const findingsAfterDedupe = tunedFindings.length;

    const counters: Record<RiskLevel, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
    };
    const byScanner: Record<Scanner, number> = {
        nuclei: 0,
        wapiti: 0,
        nikto: 0,
    };

    for (const finding of tunedFindings) {
        counters[finding.risk_level] += 1;
        byScanner[finding.source] += 1;
    }

    const total = tunedFindings.length;
    const errors = counters.critical + counters.high;
    const warnings = counters.medium + counters.low;
    const score = calculateScore(counters, errors, warnings);
    const passes = 0;
    const result: Values<SecurityResultRecord> = {
        job: jobRecordId,
        score,
        passes,
        warnings,
        errors,
        raw: {
            generated_at: new Date().toISOString(),
            findings: tunedFindings,
            summary: {
                total,
                critical: counters.critical,
                high: counters.high,
                medium: counters.medium,
                low: counters.low,
                info: counters.info,
                by_scanner: byScanner,
            },
            command_status: {
                nuclei: nucleiRun.exitCode,
                wapiti: wapitiRun.exitCode,
                nikto: niktoRun.exitCode,
            },
            config: {
                target: website,
                nuclei_templates: nucleiTemplates,
                nikto_timeout_seconds: niktoTimeout,
            },
            ...(DEBUG ? {
                debug: {
                    findings_before_dedupe: findingsBeforeDedupe,
                    findings_after_dedupe: findingsAfterDedupe,
                    dropped_duplicates: findingsBeforeDedupe - findingsAfterDedupe
                }
            } : {})
        },
    };

    const db = new Surreal();
    try {
        await db.connect(`${Bun.env.SURREAL_PROTOCOL}://${Bun.env.SURREAL_ADDRESS}/rpc`, {
            namespace: Bun.env.SURREAL_NAMESPACE,
            database: Bun.env.SURREAL_DATABASE,
            authentication: {
                username: Bun.env.SURREAL_USER!,
                password: Bun.env.SURREAL_PASS!,
            },
        });

        const securityResults = new Table("security_results");
        await db.create(securityResults).content(result);
    } catch (e) {
        throw new Error(`DB Error: ${(e as Error).message}`);
    } finally {
        await db.close();
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
