
import type { Tool } from "./types"

export const tools:Tool[] = ['probe', 'seo', 'ssl', 'wcag', 'whois', 'domain', 'security', 'stress'];
export const slowTools:Tool[] = ['seo', 'wcag', 'security', 'stress']; // tools that use a browser mostly
export const restrictedTLDs: string[] = ['es', 'va', 'az', 'vn', 'gr']; // no whois/rdap server
export const userRoles: string[] = ['admin', 'viewer', 'editor'];
