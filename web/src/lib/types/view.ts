import type {
	ApiJob,
	ApiSchedule,
	ApiScheduleRunJob,
	ApiQueueTask,
	ApiUser,
	ApiWebsite
} from '$lib/types/api';

export interface WebsiteView extends Omit<ApiWebsite, 'id' | 'owner' | 'users'> {
	id: string;
	owner_id: string;
	user_ids: string[];
}

export interface UserView extends Omit<ApiUser, 'id'> {
	id: string;
}

export interface JobView extends Omit<ApiJob, 'id' | 'website'> {
	id: string;
	website_id: string;
	website_url?: string;
}

export interface QueueTaskView extends Omit<ApiQueueTask, 'id' | 'job'> {
	id: string;
	job_id: string;
	website_url?: string;
}

export interface ScheduleRunJobView extends Omit<ApiScheduleRunJob, 'id' | 'website_id'> {
	id: string;
	website_id?: string;
}

export interface ScheduleView
	extends Omit<ApiSchedule, 'id' | 'job' | 'job_id' | 'website_id' | 'created' | 'created_jobs'> {
	id: string;
	job_id: string;
	linked_job_id?: string;
	website_id?: string;
	created: string[];
	created_jobs: ScheduleRunJobView[];
}
