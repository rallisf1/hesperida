export type MailIssueStatus = 'warn' | 'fail';

export type MailIssueRow = {
	id: string;
	group: string;
	check: string;
	status: MailIssueStatus;
	summary: string;
	details?: Record<string, unknown>;
};

const ISSUE_KEYS = new Set(['warnings', 'errors', 'syntaxErrors']);
const METADATA_ROOT_KEYS = new Set(['domain', 'checkedAt', 'duration', 'options', 'score']);

const asRecord = (value: unknown): Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const isIndexToken = (value: string): boolean => /^\d+$/.test(value);

const humanizeToken = (value: string): string =>
	value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

const summarizeIssue = (value: unknown): string => {
	if (typeof value === 'string') return cleanText(value) || 'Issue reported';
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);

	try {
		const serialized = JSON.stringify(value);
		if (!serialized) return 'Issue reported';
		return serialized.length > 240 ? `${serialized.slice(0, 240)}...` : serialized;
	} catch {
		return 'Issue reported';
	}
};

const resolveGroup = (path: string[]): string => {
	const root = path.find((token) => !isIndexToken(token));
	if (!root || METADATA_ROOT_KEYS.has(root)) return 'mail';
	return root;
};

const resolveCheck = (path: string[], fallbackKey: string): string => {
	const group = resolveGroup(path);
	const relevantPath =
		group === 'mail'
			? path.filter((token) => !isIndexToken(token))
			: path.slice(1).filter((token) => !isIndexToken(token));

	if (relevantPath.length === 0) return humanizeToken(fallbackKey);
	return relevantPath.map((token) => humanizeToken(token)).join(' / ');
};

export const collectMailIssues = (raw: unknown): MailIssueRow[] => {
	const rows: MailIssueRow[] = [];
	let sequence = 0;

	const visit = (node: unknown, path: string[]): void => {
		if (Array.isArray(node)) {
			node.forEach((item, index) => visit(item, [...path, String(index)]));
			return;
		}

		const record = asRecord(node);
		for (const [key, value] of Object.entries(record)) {
			const nextPath = [...path, key];

			if (ISSUE_KEYS.has(key) && Array.isArray(value)) {
				const status: MailIssueStatus = key === 'warnings' ? 'warn' : 'fail';
				const group = resolveGroup(nextPath);
				const check = resolveCheck(nextPath, key);
				const fullPath = nextPath.join('.');

				asArray(value).forEach((entry, index) => {
					rows.push({
						id: `mail:${group}:${fullPath}:${index}:${sequence++}`,
						group,
						check,
						status,
						summary: summarizeIssue(entry),
						details: {
							path: fullPath,
							issue_type: key
						}
					});
				});
			}

			visit(value, nextPath);
		}
	};

	visit(raw, []);
	return rows;
};
