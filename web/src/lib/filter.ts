export const setFilterParam = (url: URL, filter: string, defaultFilter = 'all'): URL => {
	const next = new URL(url);
	if (!filter || filter === defaultFilter) {
		next.searchParams.delete('filter');
	} else {
		next.searchParams.set('filter', filter);
	}
	return next;
};

