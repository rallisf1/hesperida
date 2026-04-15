import type { Tool } from '$lib/types';

export type ApiRecordId = string;
export type ApiDateTime = string;

export interface ApiError {
	code?: string;
	message?: string;
	details?: unknown;
}

export type ApiEnvelope<T = unknown> =
	| {
			ok: true;
			request_id?: string;
			data: T;
	  }
	| {
			ok: false;
			request_id?: string;
			error?: ApiError;
	  };

export interface ApiNotificationTarget {
	id: string;
	target: string;
	label?: string | null;
	enabled: boolean;
	created_at: ApiDateTime;
	updated_at: ApiDateTime;
}

export interface ApiUser {
	id: ApiRecordId;
	name: string;
	email: string;
	group: string;
	is_superuser: boolean;
	role: 'admin' | 'editor' | 'viewer';
	forgot_token?: string | null;
	notification_targets?: ApiNotificationTarget[];
	created_at?: ApiDateTime;
}

export interface ApiWebsite {
	id: ApiRecordId;
	owner: ApiRecordId;
	users: ApiRecordId[];
	description: string;
	url: string;
	verification_code?: string | null;
	verified_at?: ApiDateTime | null;
	verification_method?: 'dns' | 'file' | null;
	created_at?: ApiDateTime;
}

export interface ApiJob {
	id: ApiRecordId;
	options?: Record<string, unknown>;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	types: Tool[];
	website: ApiRecordId;
	probe?: ApiRecordId | null;
	seo?: ApiRecordId | null;
	ssl?: ApiRecordId | null;
	whois?: ApiRecordId[] | null;
	wcag?: ApiRecordId[] | null;
	domain?: ApiRecordId | null;
	security?: ApiRecordId | null;
	stress?: ApiRecordId | null;
	created_at?: ApiDateTime;
}

export interface ApiQueueTask {
	id: ApiRecordId;
	job: ApiRecordId;
	type: Tool;
	options?: Record<string, unknown>;
	attempts: number;
	next_run_at: ApiDateTime;
	target?: string;
	status: 'pending' | 'waiting' | 'processing' | 'completed' | 'failed' | 'canceled';
	created_at?: ApiDateTime;
}

export interface ApiProbeGeo {
	lat: number;
	lon: number;
	country_name: string;
	country_code: string;
	city?: string;
	zip?: string;
}

export interface ApiProbeResult {
	id?: ApiRecordId;
	job?: ApiRecordId;
	cdn: {
		name: string;
		type: string;
	} | null;
	favicon: string | null;
	geo?: ApiProbeGeo;
	ipv4?: string[];
	ipv6?: string[];
	response_time: string;
	secure: boolean;
	server: string;
	tech?: string[];
	title: string;
	wp_plugins?: string[];
	wp_themes?: string[];
	created_at?: ApiDateTime;
}

export interface ApiSSLResult {
	id?: ApiRecordId;
	job?: ApiRecordId;
	valid_from: ApiDateTime;
	valid_to: ApiDateTime;
	protocol: string;
	owner: {
		domain: string;
		name: string;
		country: string;
		address: string;
	};
	issuer: {
		domain: string;
		name: string;
		country: string;
	};
	expires_in?: number;
	created_at?: ApiDateTime;
}

export interface ApiDomainResult {
	id?: ApiRecordId;
	domain: string | null;
	tld: string | null;
	punycodeName: string | null;
	unicodeName: string | null;
	isIDN: boolean;
	registrar: {
		name: string | null;
		ianaId: string | null;
		url: string | null;
		email: string | null;
		phone: string | null;
	};
	statuses: string[];
	transferLock: boolean | null;
	creationDate: ApiDateTime | null;
	updatedDate: ApiDateTime | null;
	expirationDate: ApiDateTime | null;
	dnssecEnabled: boolean | null;
	privacyEnabled: boolean | null;
	nameservers: string[];
	records?: Record<string, Record<string, unknown>>;
	expires_in?: number;
	created_at?: ApiDateTime;
}

export interface ApiWhoisResult {
	id?: ApiRecordId;
	job?: ApiRecordId;
	as: number;
	country: string;
	date: ApiDateTime;
	ip: string;
	name: string;
	network: string;
	registry: string;
	created_at?: ApiDateTime;
}

export interface ApiCommonScoreResult {
	id?: ApiRecordId;
	job?: ApiRecordId;
	score: number;
	passes: number;
	warnings: number;
	errors: number;
	raw: unknown;
	created_at?: ApiDateTime;
}

export type ApiSeoResult = ApiCommonScoreResult;
export type ApiStressResult = ApiCommonScoreResult;
export type ApiSecurityResult = ApiCommonScoreResult;

export interface ApiWcagResult extends ApiCommonScoreResult {
	device: string;
	screenshot?: string;
}

export interface ApiJobResults extends Omit<ApiJob, 'website' | 'probe' | 'seo' | 'ssl' | 'whois' | 'wcag' | 'domain' | 'security' | 'stress'> {
	website: ApiWebsite | ApiRecordId;
	probe?: ApiProbeResult | null;
	seo?: ApiSeoResult | null;
	ssl?: ApiSSLResult | null;
	whois?: ApiWhoisResult[] | null;
	wcag?: ApiWcagResult[] | null;
	domain?: ApiDomainResult | null;
	security?: ApiSecurityResult | null;
	stress?: ApiStressResult | null;
}

export interface ApiAuthData {
	token?: string;
	refresh_token?: string | null;
	user?: ApiUser;
	success?: boolean;
}
