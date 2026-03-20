import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

interface VulnResult {
    website: string;
    vulnerability: string;
    risk_level: string;
    description: string;
}

// Function to ensure URLs are properly formatted
function sanitizeUrl(website: string): string {
    if (!website.startsWith("http")) {
        website = "https://" + website;
    }
    return website.replace(/\/+$/, "");
}

// Function to safely load JSON
async function loadJson(filePath: string): Promise<any> {
    const file = Bun.file(filePath);
    if (await file.exists()) {
        try {
            return await file.json();
        } catch (e) {
            // Silently ignore decode errors, similar to Python script
            return null;
        }
    }
    return null;
}

// Function to parse Nuclei output
async function parseNuclei(nucleiFile: string, results: VulnResult[]) {
    const data = await loadJson(nucleiFile);
    if (!Array.isArray(data)) return;

    for (const entry of data) {
        const severity = entry?.info?.severity || "Unknown";
        results.push({
            website: entry?.host || "Unknown",
            vulnerability: entry?.info?.name || "Unknown",
            risk_level: severity.charAt(0).toUpperCase() + severity.slice(1),
            description: entry?.info?.description || "No description available"
        });
    }
}

// Function to parse Wapiti output
async function parseWapiti(wapitiFile: string, results: VulnResult[]) {
    const data = await loadJson(wapitiFile);
    if (!data || Array.isArray(data)) return;

    const target = data?.infos?.target || "Unknown";
    const vulnerabilities = data?.vulnerabilities || {};

    for (const [vulnType, details] of Object.entries(vulnerabilities)) {
        if (Array.isArray(details)) {
            for (const detail of details) {
                results.push({
                    website: target,
                    vulnerability: vulnType,
                    risk_level: (detail?.level || 0) >= 3 ? "High" : "Low",
                    description: detail?.info || "No description available"
                });
            }
        }
    }
}

// Function to parse Nikto output
async function parseNikto(niktoFile: string, website: string, results: VulnResult[]) {
    const data = await loadJson(niktoFile);
    if (!data || !Array.isArray(data.vulnerabilities)) return;

    for (const vuln of data.vulnerabilities) {
        results.push({
            website,
            vulnerability: vuln?.id || "Unknown",
            risk_level: "Medium",
            description: vuln?.msg || "No description available"
        });
    }
}

// Function to run a CLI command with an optional timeout
async function runCommand(args: string[], timeoutSeconds: number = 0): Promise<{ timedOut: boolean }> {
    const proc = Bun.spawn(args, {
        stdout: "ignore",
        stderr: "ignore",
    });

    if (timeoutSeconds > 0) {
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            proc.kill();
        }, timeoutSeconds * 1000);

        await proc.exited;
        clearTimeout(timeoutId);
        return { timedOut };
    } else {
        await proc.exited;
        return { timedOut: false };
    }
}

// Function to run scans
async function runScans(website: string, outputDir: string, logDir: string) {
    const sanitizedWebsite = sanitizeUrl(website);
    const urlObj = new URL(sanitizedWebsite);
    const domain = urlObj.hostname || urlObj.pathname; // Fallback if format is strange
    const websiteDir = join(outputDir, domain);
    
    await mkdir(websiteDir, { recursive: true });

    const logEntry = { website: domain, nuclei: 0, wapiti: 0, nikto: 0, total: 0 };
    const results: VulnResult[] = [];
    const startTime = performance.now();

    try {
        // Nuclei
        const nucleiOutput = join(websiteDir, "nuclei_scan.json");
        let tStart = performance.now();
        await runCommand(["nuclei", "-target", sanitizedWebsite, "-json-export", nucleiOutput]);
        logEntry.nuclei = Number(((performance.now() - tStart) / 60000).toFixed(2));
        await parseNuclei(nucleiOutput, results);

        // Wapiti
        const wapitiOutput = join(websiteDir, "wapiti_scan.json");
        tStart = performance.now();
        await runCommand(["wapiti", "-u", sanitizedWebsite, "-o", wapitiOutput, "-f", "json"]);
        logEntry.wapiti = Number(((performance.now() - tStart) / 60000).toFixed(2));
        await parseWapiti(wapitiOutput, results);

        // Nikto - OWASP focused tuning
        const niktoOutput = join(websiteDir, "nikto_scan.json");
        tStart = performance.now();
        const niktoStatus = await runCommand([
            "nikto", "-h", sanitizedWebsite,
            "-Tuning", "124356bc",
            "-Format", "json", "-o", niktoOutput
        ], 900); // 900 seconds timeout

        if (niktoStatus.timedOut) {
            await appendFile(join(logDir, "nikto_delay.txt"), `${domain}\n`);
        }
        
        logEntry.nikto = Number(((performance.now() - tStart) / 60000).toFixed(2));
        await parseNikto(niktoOutput, sanitizedWebsite, results);

        const combinedOutput = join(websiteDir, "combined.json");
        await Bun.write(combinedOutput, JSON.stringify(results, null, 4));

    } catch (e) {
        await appendFile(join(logDir, "skipped.txt"), `${domain}\n`);
        return;
    }

    logEntry.total = Number(((performance.now() - startTime) / 60000).toFixed(2));
    await appendFile(
        join(logDir, "time.txt"),
        `${logEntry.website}, ${logEntry.nikto} min, ${logEntry.wapiti} min, ${logEntry.nuclei} min, ${logEntry.total} min\n`
    );

    console.log(`${sanitizedWebsite} scan complete. Results saved in ${websiteDir}.`);
}

// Function to handle multi-threaded (async pool) scanning
async function processWebsites(websites: string[], outputDir: string, maxWorkers: number) {
    await mkdir(outputDir, { recursive: true });
    const logDir = join(outputDir, "log");
    await mkdir(logDir, { recursive: true });

    // Initialize log files
    await Bun.write(join(logDir, "time.txt"), "website name, nikto, wapiti, nuclei, total\n");
    await Bun.write(join(logDir, "skipped.txt"), "");
    await Bun.write(join(logDir, "nikto_delay.txt"), "");

    // Worker pool queue
    const queue = [...websites];
    const workers = Array.from({ length: maxWorkers }, async () => {
        while (queue.length > 0) {
            const site = queue.shift();
            if (site) {
                await runScans(site, outputDir, logDir);
            }
        }
    });

    await Promise.all(workers);
    console.log("All scans completed.");
}

// Main execution
async function main() {
    const { values } = parseArgs({
        args: Bun.argv,
        options: {
            websites: { type: "string", short: "w" },
            "output-dir": { type: "string", short: "o" },
            threads: { type: "string", short: "t", default: "5" },
        },
        strict: true,
        allowPositionals: true,
    });

    if (!values.websites || !values["output-dir"]) {
        console.error("Usage: bun run scanner.ts -w <websites.txt> -o <output_dir> [-t <threads>]");
        process.exit(1);
    }

    const fileContent = await Bun.file(values.websites).text();
    const websites = fileContent
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(sanitizeUrl);

    const threads = parseInt(values.threads as string, 10);
    const outputDir = values["output-dir"] as string;

    console.log(`Starting scans for ${websites.length} websites using ${threads} concurrent workers...`);

    const startTime = performance.now();
    await processWebsites(websites, outputDir, threads);
    const endTime = performance.now();

    const executionTime = (endTime - startTime) / 1000;
    
    await appendFile(
        join(outputDir, "log", "execution_time.log"), 
        `Total execution time: ${executionTime.toFixed(2)} seconds\n`
    );

    console.log(`Total execution time: ${executionTime.toFixed(2)} seconds`);
}

main().catch(console.error);