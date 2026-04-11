import type { PageServerLoad } from './$types';
import { callDashboardApi } from '$lib/server/dashboard-api';
import { normalizeRecordId, toRouteId } from '$lib/server/record-id';
import type { Website } from '$lib/types';

export const load: PageServerLoad = async (event) => {
	const data = await callDashboardApi<{ user: { id: string; name: string; email: string; role?: string; created_at?: string } }>(
		event,
		`/api/v1/users/${event.params.id}`
	);
	const websitesData = await callDashboardApi<{ websites: Website[] }>(event, '/api/v1/websites');

	const userRecordId = normalizeRecordId(data.user.id);
	const userRouteId = toRouteId(data.user.id);
	const websites = (websitesData.websites ?? []).map((website) => {
		const ownerId = website.owner ? normalizeRecordId(website.owner) : '';
		const memberIds = Array.isArray(website.users)
			? website.users.map((member) => normalizeRecordId(member))
			: [];
		const isOwner = ownerId === userRecordId;
		const isMember = memberIds.includes(userRecordId) && !isOwner;
		return {
			...website,
			id: toRouteId(website.id),
			isOwner,
			isMember
		};
	});

	return {
		user: {
			...data.user,
			id: userRouteId
		},
		websites
	};
};
