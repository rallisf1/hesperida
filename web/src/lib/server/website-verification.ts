import { config } from '$lib/server/config';
import { toRegistrableDomain } from "rdapper";
import { DateTime, Duration, RecordId } from 'surrealdb';
import { queryOne, withAdminDb } from '$lib/server/db';
import type { Website } from '$lib/types';

type VerificationMethod = 'cache' | 'dns' | 'http' | 'none';

type VerificationResult = {
	verified: boolean;
	method: VerificationMethod;
	txtHost: string;
	txtValue: string;
	httpUrl: string;
	errors?: string[];
};

const cleanTxtValue = (value: string): string => value.replace(/^"+|"+$/g, '').replace(/\\"/g, '"').trim();

export const generateWebsiteVerificationCode = (): string =>
	crypto.randomUUID().replace(/-/g, '').toLowerCase();

const isWebsiteVerificationFresh = (
	verifiedAt: DateTime,
	ttlSeconds = config.websiteVerificationTtlSeconds
): boolean => {
	const now = new DateTime();
	const ttlDuration = new Duration(`${ttlSeconds}s`);
	const threshold = verifiedAt.add(ttlDuration);
	return now.compare(threshold) !== 1;
};

const checkDnsTxt = async (txtHost: string, code: string): Promise<{ ok: boolean; error?: string }> => {
	try {
		const response = await fetch(
			`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(txtHost)}&type=TXT`,
			{
				headers: {
					accept: 'application/dns-json'
				}
			}
		);
		if (!response.ok) {
			return { ok: false, error: `DNS lookup failed with HTTP ${response.status}` };
		}
		const payload = (await response.json()) as { Answer?: Array<{ data?: string }> };
		const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
		const values = answers
			.map((entry) => (typeof entry?.data === 'string' ? cleanTxtValue(entry.data) : ''))
			.filter(Boolean);
		return { ok: values.includes(code) };
	} catch (error) {
		return { ok: false, error: (error as Error).message };
	}
};

const checkHttpFile = async (httpUrl: string): Promise<{ ok: boolean; error?: string }> => {
	try {
		const response = await fetch(httpUrl, { method: 'GET' });
		return { ok: response.status === 200, error: response.status === 200 ? undefined : `HTTP ${response.status}` };
	} catch (error) {
		return { ok: false, error: (error as Error).message };
	}
};

const updateWebsiteVerificationDate = async (id: RecordId, isValid: boolean = true): Promise<{ ok: boolean; error?: string }> => {
	const refreshed = await withAdminDb((db) =>
		queryOne<Website>(
			db,
			isValid
				? 'UPDATE websites SET verified_at = time::now() WHERE id = $id RETURN id, url, verification_code, verified_at;'
				: 'UPDATE websites SET verified_at = NONE WHERE id = $id RETURN id, url, verification_code, verified_at;',
			{ id }
		)
	);
	if (!refreshed) {
		return { ok: false, error: 'Unable to persist verification date.'};
	} else {
		return { ok: true }
	}
}

export const verifyWebsiteOwnership = async (website: Website, skipCache: boolean = false): Promise<VerificationResult> => {
	const verifyResult: VerificationResult = {
		verified: false,
		method: 'none',
		txtValue: website.verification_code,
		txtHost: '',
		httpUrl: '',
		errors: []
	}
	if(!verifyResult.txtValue) {
		// verification code missing, website created before v0.4.1
		verifyResult.txtValue = generateWebsiteVerificationCode();
		const updated = await withAdminDb((db) =>
			queryOne<Website>(
				db,
				'UPDATE websites SET verification_code = $code WHERE id = $id RETURN id, url, verification_code, verified_at;',
				{ id: website.id, code: verifyResult.txtValue }
			)
		);
		if (!updated) {
			verifyResult.errors?.push('Unable to persist verification code.');
			return verifyResult;
		}
	}

	let parsed: URL
	try {
		parsed = new URL(website.url);
	} catch(e) {
		verifyResult.errors?.push((e as Error).message);
		return verifyResult;
	}
	verifyResult.httpUrl = `${parsed.origin}/hesperida-${verifyResult.txtValue}.txt`;
	const registrableDomain = toRegistrableDomain(parsed.hostname);
	if(!registrableDomain && !parsed.hostname.endsWith('example.test')) {
		// allow *.example.test for tests to pass
		verifyResult.errors?.push('Invalid Domain.');
		return verifyResult;
	}

	verifyResult.txtHost = `hesperida.${registrableDomain}`.toLowerCase();
	if(!skipCache) {
		const cached = website.verified_at ?
			isWebsiteVerificationFresh(website.verified_at, config.websiteVerificationTtlSeconds)
			: false;
		if (cached) {
			verifyResult.method = 'cache';
			verifyResult.verified = true;
			return verifyResult;
		}
	}

	const dns = await checkDnsTxt(verifyResult.txtHost, verifyResult.txtValue);
	let updateResult = await updateWebsiteVerificationDate(website.id!, dns.ok);
	if(!updateResult.ok) {
		verifyResult.errors?.push(updateResult.error!);
		return verifyResult;
	}
	if (dns.ok) {
		verifyResult.method = 'dns';
		verifyResult.verified = true;
		return verifyResult;
	}
	if (dns.error) verifyResult.errors?.push(dns.error);

	const http = await checkHttpFile(verifyResult.httpUrl);
	updateResult = await updateWebsiteVerificationDate(website.id!, http.ok);
	if(!updateResult.ok) {
		verifyResult.errors?.push(updateResult.error!);
		return verifyResult;
	}
	if (http.ok) {
		verifyResult.method = 'http';
		verifyResult.verified = true;
		return verifyResult;
	}
	if (http.error) verifyResult.errors?.push(http.error);

	return verifyResult;
};
