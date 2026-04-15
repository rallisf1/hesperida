import type { RequestEvent } from '@sveltejs/kit';
import { callDashboardApi } from '$lib/server/dashboard-api';
import { toRouteIdString } from '$lib/server/dashboard-mappers';
import type { ApiJob, ApiQueueTask, ApiWebsite, ApiWcagResult } from '$lib/types/api';
import type { Tool } from '$lib/types';

export type DiffCandidateOption = {
	id: string;
	website_url: string;
	created_at: string;
	type: string;
	status: string;
	target: string;
	job_id: string;
	label: string;
};

export type DiffTaskView = {
	id: string;
	type: string;
	status: string;
	target: string;
	created_at: string;
	job_id: string;
	website_url: string;
};

export type DiffTaskResultPayload = {
	task: DiffTaskView;
	result: unknown;
};

type QueueTaskWithWebsite = ApiQueueTask & {
	website_url: string;
	job_id: string;
};

const loadQueueTasksWithWebsite = async (event: RequestEvent): Promise<QueueTaskWithWebsite[]> => {
	const data = await callDashboardApi<{ tasks: ApiQueueTask[] }>(event, '/api/v1/job-queue');

	return Promise.all(
		(data.tasks ?? []).map(async (task) => {
			const jobRouteId = toRouteIdString(task.job);
			let websiteUrl = '-';

			if (jobRouteId) {
				try {
					const jobData = await callDashboardApi<{ job: ApiJob }>(
						event,
						`/api/v1/jobs/${jobRouteId}`
					);
					const websiteId = toRouteIdString(jobData.job.website);
					if (websiteId) {
						const websiteData = await callDashboardApi<{ website: ApiWebsite }>(
							event,
							`/api/v1/websites/${websiteId}`
						);
						websiteUrl = websiteData.website?.url ?? '-';
					}
				} catch {
					websiteUrl = '-';
				}
			}

			return {
				...task,
				website_url: websiteUrl,
				job_id: jobRouteId
			};
		})
	);
};

const toTaskView = (task: QueueTaskWithWebsite): DiffTaskView => ({
	id: toRouteIdString(task.id),
	type: String(task.type ?? ''),
	status: String(task.status ?? ''),
	target: String(task.target ?? ''),
	created_at: String(task.created_at ?? ''),
	job_id: toRouteIdString(task.job),
	website_url: String(task.website_url ?? '-')
});

const toCandidate = (task: QueueTaskWithWebsite): DiffCandidateOption => {
	const taskView = toTaskView(task);
	return {
		...taskView,
		label: `${taskView.website_url} · ${taskView.created_at}`
	};
};

const resolveToolResult = async (
	event: RequestEvent,
	taskView: DiffTaskView
): Promise<unknown> => {
	const taskType = String(taskView.type ?? '').toLowerCase() as Tool;
	const resultData = await callDashboardApi<{ tool: Tool; result: unknown }>(
		event,
		`/api/v1/results/jobs/${taskView.job_id}/${taskType}`
	);

	if (taskType === 'wcag') {
		const resultArray: ApiWcagResult[] = Array.isArray(resultData.result)
			? (resultData.result as ApiWcagResult[])
			: resultData.result
				? [resultData.result as ApiWcagResult]
				: [];
		const target = String(taskView.target ?? '').trim().toLowerCase();
		return (
			resultArray.find((entry) => String(entry.device ?? '').toLowerCase() === target) ??
			resultArray[0] ??
			null
		);
	}

	return resultData.result;
};

export const loadTaskResultPayload = async (
	event: RequestEvent,
	taskRouteId: string
): Promise<DiffTaskResultPayload> => {
	const tasks = await loadQueueTasksWithWebsite(event);
	const task = tasks.find((entry) => toRouteIdString(entry.id) === taskRouteId);
	if (!task) {
		throw new Error('Task not found.');
	}
	const taskView = toTaskView(task);
	const result = await resolveToolResult(event, taskView);
	return {
		task: taskView,
		result
	};
};

export const loadJobQueueDiffData = async (event: RequestEvent) => {
	const leftTaskData = await callDashboardApi<{ task: ApiQueueTask }>(
		event,
		`/api/v1/job-queue/${event.params.id}`
	);
	const leftRouteId = toRouteIdString(leftTaskData.task.id);
	const leftType = String(leftTaskData.task.type ?? '').toLowerCase();
	const tasks = await loadQueueTasksWithWebsite(event);
	const leftTask = tasks.find((task) => toRouteIdString(task.id) === leftRouteId);
	if (!leftTask) {
		throw new Error('Task not found.');
	}
	const leftTaskView = toTaskView(leftTask);
	const leftResult = await resolveToolResult(event, leftTaskView);

	const candidates = tasks
		.filter((task) => toRouteIdString(task.id) !== leftRouteId)
		.filter((task) => String(task.status ?? '') === 'completed')
		.filter((task) => String(task.type ?? '').toLowerCase() === leftType)
		.sort((a, b) => new Date(String(b.created_at ?? '')).getTime() - new Date(String(a.created_at ?? '')).getTime())
		.map(toCandidate);

	return {
		leftTask: leftTaskView,
		leftResult,
		candidates,
		breadcrumbEntityLabel: `Diff ${leftType.toUpperCase()} @ ${leftTaskView.website_url}`,
		breadcrumbEntityHref: `/job-queue/${leftRouteId}/diff`
	};
};

