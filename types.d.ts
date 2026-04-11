// @ts-expect-error
import {type DateTime, RecordId} from 'surrealdb'; // it will be imported where this is loaded

export type Tool = 'probe' | 'seo' | 'ssl' | 'wcag' | 'whois' | 'domain' | 'security' | 'stress';

export interface NotificationTarget {
    id: string;
    target: string;
    label?: string | null;
    enabled: boolean;
    created_at: DateTime;
    updated_at: DateTime;
}

export interface User {
    id?: RecordId<'users'>;
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'editor' | 'viewer';
    forgot_token?: string | null;
    notification_targets?: NotificationTarget[];
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
    created_at?: DateTime;
}

export interface Website {
    id?: RecordId<'websites'>;
    owner: RecordId<'users'>;
    users: RecordId<'users'>[];
    description: string;
    url: string;
    verification_code: string;
    verified_at?: DateTime;
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
  transferLock: boolean;
  creationDate: DateTime | null;
  updatedDate: DateTime | null;
  expirationDate: DateTime | null;
  dnssecEnabled: boolean;
  privacyEnabled: boolean;
  nameservers: string[];
  records?: object;
  created_at?: DateTime;
}

export interface Security {
    id?: RecordId<'security_results'>;
    job: RecordId<'jobs'>;
    score: number;
    passes: number;
    warnings: number;
    errors: number;
    raw: object;
    created_at?: DateTime;
}

export interface Stress {
    id?: RecordId<'stress_results'>;
    job: RecordId<'jobs'>;
    score: number;
    passes: number;
    warnings: number;
    errors: number;
    raw: object;
    created_at?: DateTime;
}

export type ApiEnvelope =
	| { ok: true; data?: { token?: string } }
	| { ok: false; error?: { message?: string } };