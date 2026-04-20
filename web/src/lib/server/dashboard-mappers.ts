import { toRouteId } from './record-id';
import type {
	ApiDateTime,
	ApiJob,
	ApiSchedule,
	ApiScheduleRunJob,
	ApiQueueTask,
	ApiUser,
	ApiWebsite
} from '$lib/types/api';
import type {
	JobView,
	QueueTaskView,
	ScheduleRunJobView,
	ScheduleView,
	UserView,
	WebsiteView
} from '$lib/types/view';

const toIso = (value: unknown): string => {
	if (!value) return '';
	if (typeof value === 'string') return value;
	if (value instanceof Date) return value.toISOString();
	return String(value);
};

export const toRouteIdString = (value: unknown): string => {
	if (!value) return '';
	return toRouteId(String(value));
};

export const toIsoDateString = (value: unknown): ApiDateTime => toIso(value);

export const mapWebsiteToView = (website: ApiWebsite): WebsiteView => ({
	...website,
	id: toRouteIdString(website.id),
	owner_id: toRouteIdString(website.owner),
	user_ids: (website.users ?? []).map((userId) => toRouteIdString(userId))
});

export const mapUserToView = (user: ApiUser): UserView => ({
	...user,
	id: toRouteIdString(user.id)
});

export const mapJobToView = (job: ApiJob): JobView => ({
	...job,
	id: toRouteIdString(job.id),
	website_id: toRouteIdString(job.website)
});

export const mapQueueTaskToView = (
	task: ApiQueueTask,
	websiteUrl?: string
): QueueTaskView => ({
	...task,
	id: toRouteIdString(task.id),
	job_id: toRouteIdString(task.job),
	website_url: websiteUrl ?? ''
});

export const mapScheduleRunJobToView = (job: ApiScheduleRunJob): ScheduleRunJobView => ({
	...job,
	id: toRouteIdString(job.id),
	website_id: job.website_id ? toRouteIdString(job.website_id) : undefined,
	created_at: toIsoDateString(job.created_at)
});

export const mapScheduleToView = (schedule: ApiSchedule): ScheduleView => ({
	...schedule,
	id: toRouteIdString(schedule.id),
	job_id: toRouteIdString(schedule.job),
	linked_job_id: schedule.job_id ? toRouteIdString(schedule.job_id) : undefined,
	website_id: schedule.website_id ? toRouteIdString(schedule.website_id) : undefined,
	created: (schedule.created ?? []).map((jobId) => toRouteIdString(jobId)),
	created_jobs: (schedule.created_jobs ?? []).map(mapScheduleRunJobToView),
	created_at: toIsoDateString(schedule.created_at),
	updated_at: toIsoDateString(schedule.updated_at)
});
