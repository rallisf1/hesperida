export type PaginationAll = { mode: 'all' };
export type PaginationPaged = {
	mode: 'paged';
	page: number;
	pageSize: number;
	limit: number;
	offset: number;
};

export type PaginationResult =
	| { ok: true; value: PaginationAll | PaginationPaged }
	| { ok: false; message: string };

const parsePositiveInt = (value: string): number | null => {
	if (!/^\d+$/.test(value)) return null;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1) return null;
	return parsed;
};

export const parsePaginationParams = (searchParams: URLSearchParams): PaginationResult => {
	const pageRaw = searchParams.get('page');
	const pageSizeRaw = searchParams.get('page_size');

	if (!pageRaw && !pageSizeRaw) {
		return { ok: true, value: { mode: 'all' } };
	}

	if (!pageRaw || !pageSizeRaw) {
		return {
			ok: false,
			message: 'Both page and page_size must be provided together.'
		};
	}

	const page = parsePositiveInt(pageRaw.trim());
	const pageSize = parsePositiveInt(pageSizeRaw.trim());
	if (!page || !pageSize) {
		return {
			ok: false,
			message: 'page and page_size must be positive integers.'
		};
	}

	return {
		ok: true,
		value: {
			mode: 'paged',
			page,
			pageSize,
			limit: pageSize,
			offset: (page - 1) * pageSize
		}
	};
};
