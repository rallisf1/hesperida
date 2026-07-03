import {type DateTime, RecordId} from 'surrealdb'; // it will be imported where this is loaded

export type Tool = 'probe' | 'seo' | 'ssl' | 'wcag' | 'whois' | 'domain' | 'security' | 'stress' | 'mail';

export interface WebsiteNotificationEvents {
	JOB_COMPLETED: boolean;
	JOB_FAILED: boolean;
	SEO_SCORE_BELOW: number | null;
	STRESS_SCORE_BELOW: number | null;
	MAIL_SCORE_BELOW: number | null;
	WCAG_SCORE_BELOW: number | null;
	SECURITY_SCORE_BELOW: number | null;
}

export interface NotificationChannel {
	id?: RecordId<'notification_channels'>;
	user: RecordId<'users'>;
	name: string;
	apprise_url: string;
	created_at?: DateTime;
	updated_at?: DateTime;
}

export interface WebsiteNotification {
	id?: RecordId<'website_notifications'>;
	website: RecordId<'websites'>;
	notification_channel: RecordId<'notification_channels'>;
	events: WebsiteNotificationEvents;
	created_at?: DateTime;
	updated_at?: DateTime;
}

export interface User {
    id?: RecordId<'users'>;
    name: string;
    email: string;
    password: string;
    group: string;
    is_superuser: boolean;
    role: 'admin' | 'editor' | 'viewer';
    forgot_token?: string | null;
    created_at?: DateTime;
}

export interface Job {
    id?: RecordId<'jobs'>;
    options?: Record<string, unknown>;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    types: Tool[];
    website: RecordId<'websites'>;
    probe?: RecordId<'probe_results'>;
    seo?: RecordId<'seo_results'>;
    ssl?: RecordId<'ssl_results'>;
    whois?: RecordId<'whois_results'>[];
    wcag?: RecordId<'wcag_results'>[];
    domain?: RecordId<'domain_results'>;
    security?: RecordId<'security_results'>;
    stress?: RecordId<'stress_results'>;
    mail?: RecordId<'mail_results'>;
    created_at?: DateTime;
}

export interface Schedule {
    id?: RecordId<'schedule'>;
    website: RecordId<'websites'>;
    types: Tool[];
    options?: Record<string, unknown> | null;
    cron: string;
    created: RecordId<'jobs'>[];
    enabled: boolean;
    created_at?: DateTime;
    updated_at?: DateTime;
}

export interface Website {
    id?: RecordId<'websites'>;
    owner: RecordId<'users'>;
    users: RecordId<'users'>[];
    description: string;
    url: string;
    verification_id?: RecordId<'website_verifications'>;
    created_at?: DateTime;
}

export interface WebsiteUrl {
    id?: RecordId<'website_urls'>;
    website: RecordId<'websites'>;
    url: string;
    normalized_url: string;
    source: 'migration' | 'manual' | 'seo' | 'wcag' | 'security' | 'sitemap' | 'crawl';
    status_code?: number | null;
    content_type?: string | null;
    selected: boolean;
    manual: boolean;
    excluded: boolean;
    template_key?: string | null;
    template_label?: string | null;
    last_seen_at?: DateTime | null;
    created_at?: DateTime;
    updated_at?: DateTime;
}

export interface WebsiteVerification {
    id?: RecordId<'website_verifications'>;
    group: string;
    registrable_domain: string;
    verification_code: string;
    verified_at?: DateTime;
    verification_method?: 'dns' | 'file' | null;
    created_at?: DateTime;
}

export interface Queue {
    id?: RecordId<'job_queue'>;
    job: RecordId<'jobs'>;
    type: Tool;
    options?: Record<string, unknown>;
    attempts: number;
    next_run_at: DateTime;
    target?: string;
    status: 'pending' | 'waiting' | 'processing' | 'completed' | 'failed' | 'canceled';
    created_at?: DateTime;
}

export interface Probe {
    id?: RecordId<'probe_results'>;
    job: RecordId<'jobs'>;
    cdn: {
        name: string;
        type: string;
    } | null;
    favicon: string | null;
    geo?: {
        lat: number;
        lon: number;
        country_name: string;
        country_code: string;
        city?: string;
        zip?: string;
    };
    ipv4?: string[];
    ipv6?: string[];
    response_time: string;
    secure: boolean;
    server: string;
    tech?: string[];
    title: string;
    wp_plugins?: string[];
    wp_themes?: string[];
    created_at?: DateTime;
}

export interface SSL {
    id?: RecordId<'ssl_results'>;
    job: RecordId<'jobs'>;
    valid_from: DateTime;
    valid_to: DateTime;
    protocol: string;
    owner: {
        domain: string;
        name: string;
        country: string;
        address: string;
    },
    issuer: {
        domain: string;
        name: string;
        country: string;
    }
    created_at?: DateTime;
}

type DomainRecords = {
    [type: string] : {
        [name: string] : string[] | {
            exchange: string;
            priority: number;
        }[];
    };
}

export interface Domain {
  id?: RecordId<'domain_results'>;
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
  creationDate: DateTime | null;
  updatedDate: DateTime | null;
  expirationDate: DateTime | null;
  dnssecEnabled: boolean | null;
  privacyEnabled: boolean | null;
  nameservers: string[];
  records?: DomainRecords;
  created_at?: DateTime;
}

export interface Whois {
    id?: RecordId<'whois_results'>;
    job: RecordId<'jobs'>;
    as: number;
    country: string;
    date: DateTime;
    ip: string;
    name: string;
    network: string;
    registry: string;
    created_at?: DateTime;
}

export interface CommonResults {
    job: RecordId<'jobs'>;
    score: number;
    passes: number;
    warnings: number;
    errors: number;
    raw: object;
    created_at?: DateTime;
}

export interface Security extends CommonResults {
    id?: RecordId<'security_results'>;
}

export interface Stress extends CommonResults {
    id?: RecordId<'stress_results'>;
}

export interface SEO extends CommonResults {
    id?: RecordId<'seo_results'>;
}

export interface WCAG extends CommonResults {
    id?: RecordId<'wcag_results'>;
    device: string;
    url?: string | null;
    screenshot?: string;
}

export interface Mail extends CommonResults {
    id?: RecordId<'mail_results'>;
}

export type ApiEnvelope =
	| { ok: true; data?: { token?: string } }
	| { ok: false; error?: { message?: string } };
