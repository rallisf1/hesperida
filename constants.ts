
import type { Tool } from "./types"

export const tools:Tool[] = ['probe', 'seo', 'ssl', 'wcag', 'whois', 'domain', 'security'];
export const slowTools:Tool[] = ['seo', 'wcag', 'security']; // tools that use a browser mostly
export const restrictedTLDs: string[] = ['es', 'va', 'az', 'vn', 'gr']; // no whois/rdap server
