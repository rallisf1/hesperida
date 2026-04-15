<script lang="ts">
	import { enhance } from '$app/forms';
	import { source } from "sveltekit-sse";
	import { onDestroy, onMount } from "svelte";
	import { goto } from '$app/navigation';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table';
	import MultiSelect, { type Option } from 'svelte-multiselect';
	import type { QueueTaskRow, QueueTaskStreamEvent } from '$lib/queue-tasks';
	import { setFilterParam } from '$lib/filter';
	import { createToastEnhance } from '$lib/form-toast';
	import { formatDate } from '$lib/utils.js';

	let { data, form } = $props();
	type QueueStatus = 'all' | 'pending' | 'waiting' | 'processing' | 'completed' | 'failed' | 'canceled';
	let statusFilter = $derived<QueueStatus>((data.initialFilter ?? 'all') as QueueStatus);
	let tasks = $state<QueueTaskRow[]>([]);
	const currentUserRole = $derived((data.currentUserRole ?? null) as 'admin' | 'editor' | 'viewer' | null);
	let selectedWebsite = $state<Option | null>(null);
	let selectedType = $state<Option | null>(null);
	let seededFromLoad = $state(false);
	const UNSTUCK_MIN_AGE_MS = 5 * 60 * 1000;

	const optionValue = (option: Option | null | undefined): string => {
		if (option == null) return '';
		if (typeof option === 'string' || typeof option === 'number') return String(option);
		return String(option.value ?? '');
	};

	$effect(() => {
		if (seededFromLoad) return;
		tasks = (data.tasks ?? []).map((task): QueueTaskRow => ({
			id: String(task.id ?? ''),
			job_id: String(task.job_id ?? ''),
			type: String(task.type ?? ''),
			website_url: String(task.website_url ?? '-'),
			target: String(task.target ?? '-'),
			status: task.status,
			created_at: String(task.created_at ?? '')
		}));
		seededFromLoad = true;
	});

	const sortByCreatedAt = (rows: QueueTaskRow[]): QueueTaskRow[] =>
		[...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

	const upsertTask = (rows: QueueTaskRow[], task: QueueTaskRow): QueueTaskRow[] => {
		const idx = rows.findIndex((item) => item.id === task.id);
		if (idx === -1) return sortByCreatedAt([...rows, task]);
		const copy = [...rows];
		copy[idx] = task;
		return sortByCreatedAt(copy);
	};

	const removeTask = (rows: QueueTaskRow[], id: string): QueueTaskRow[] =>
		rows.filter((task) => task.id !== id);

	let connection: ReturnType<typeof source> | null = null;
	let unsubscribe: (() => void) | null = null;

	onMount(() => {
		connection = source("/streams/job-queue");
		const stream = connection.select("job_queue").json<QueueTaskStreamEvent>();
		unsubscribe = stream.subscribe((event) => {
			if (!event) return;
			if (event.type === "snapshot") {
				tasks = sortByCreatedAt(event.tasks);
				return;
			}
			if (event.type === "upsert") {
				tasks = upsertTask(tasks, event.task);
				return;
			}
			if (event.type === "remove") {
				tasks = removeTask(tasks, event.id);
			}
		});
	});

	onDestroy(() => {
		unsubscribe?.();
		connection?.close();
	});

	const websiteOptions = $derived.by(() => {
		const urls = [...new Set(tasks.map((task) => String(task.website_url ?? '').trim()).filter(Boolean))];
		urls.sort((a, b) => a.localeCompare(b));
		return urls.map((url) => ({ label: url, value: url })) as Option[];
	});

	const typeOptions = $derived.by(() => {
		const types = [...new Set(tasks.map((task) => String(task.type ?? '').trim()).filter(Boolean))];
		types.sort((a, b) => a.localeCompare(b));
		return types.map((type) => ({ label: type, value: type })) as Option[];
	});

	const filteredTasks = $derived.by(() => {
		const byStatus =
			statusFilter === 'all'
				? tasks
				: tasks.filter((task: { status?: string }) => task.status === statusFilter);

		const selectedWebsiteUrl = optionValue(selectedWebsite).trim();
		const byWebsite = selectedWebsiteUrl
			? byStatus.filter((task) => String(task.website_url ?? '') === selectedWebsiteUrl)
			: byStatus;

		const selectedTaskType = optionValue(selectedType).trim();
		return selectedTaskType
			? byWebsite.filter((task) => String(task.type ?? '') === selectedTaskType)
			: byWebsite;
	});

	const statusBadgeVariant = (status?: string) => {
		switch (status) {
			case 'completed':
				return 'secondary';
			case 'failed':
			case 'canceled':
				return 'destructive';
			case 'processing':
			case 'waiting':
				return 'default';
			case 'pending':
			default:
				return 'outline';
		}
	};

	const selectFilter = async (filter: QueueStatus) => {
		statusFilter = filter;
		const next = setFilterParam(new URL(window.location.href), filter, 'all');
		await goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	};

	const isStalePendingTask = (task: QueueTaskRow): boolean => {
		if (task.status !== 'pending') return false;
		const createdAtMs = new Date(task.created_at).getTime();
		if (!Number.isFinite(createdAtMs)) return false;
		return Date.now() - createdAtMs >= UNSTUCK_MIN_AGE_MS;
	};

	const canUnstuckTask = (task: QueueTaskRow): boolean =>
		(currentUserRole === 'admin' || currentUserRole === 'editor') && isStalePendingTask(task);
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Job Queue</h2>
	</div>

	{#if data.error}
		<p class="text-destructive text-sm">{data.error}</p>
	{/if}
	{#if form?.cancel_error}
		<p class="text-destructive text-sm">{form.cancel_error}</p>
	{/if}
	{#if form?.unstuck_error}
		<p class="text-destructive text-sm">{form.unstuck_error}</p>
	{/if}

	<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
		<Tabs.Root value={statusFilter}>
			<Tabs.List>
				<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
				<Tabs.Trigger value="pending" onclick={() => void selectFilter('pending')}>Pending</Tabs.Trigger>
				<Tabs.Trigger value="waiting" onclick={() => void selectFilter('waiting')}>Waiting</Tabs.Trigger>
				<Tabs.Trigger value="processing" onclick={() => void selectFilter('processing')}>Processing</Tabs.Trigger>
				<Tabs.Trigger value="completed" onclick={() => void selectFilter('completed')}>Completed</Tabs.Trigger>
				<Tabs.Trigger value="failed" onclick={() => void selectFilter('failed')}>Failed</Tabs.Trigger>
				<Tabs.Trigger value="canceled" onclick={() => void selectFilter('canceled')}>Canceled</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
		<div class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:w-[36rem]">
			<MultiSelect
				bind:value={selectedWebsite}
				options={websiteOptions}
				maxSelect={1}
				allowEmpty
				placeholder="Filter by website"
			/>
			<MultiSelect
				bind:value={selectedType}
				options={typeOptions}
				maxSelect={1}
				allowEmpty
				placeholder="Filter by type"
			/>
		</div>
	</div>

	<div class="overflow-auto rounded-md border">
		<Table.Root class="w-full text-sm">
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="text-left p-3">Website URL</Table.Head>
					<Table.Head class="text-left p-3">Type</Table.Head>
					<Table.Head class="text-left p-3">Target</Table.Head>
					<Table.Head class="text-left p-3">Status</Table.Head>
					<Table.Head class="text-left p-3">Created</Table.Head>
					<Table.Head class="text-left p-3">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if filteredTasks.length === 0}
					<Table.Row><Table.Cell colspan={6} class="p-3 text-muted-foreground">No queue tasks found.</Table.Cell></Table.Row>
				{:else}
					{#each filteredTasks as task (task.id)}
						<Table.Row class="border-t">
							<Table.Cell class="p-3">{task.website_url ?? '-'}</Table.Cell>
							<Table.Cell class="p-3">
								<Badge variant="outline">{task.type ?? '-'}</Badge>
							</Table.Cell>
							<Table.Cell class="p-3">{task.target ?? '-'}</Table.Cell>
							<Table.Cell class="p-3">
								<Badge variant={statusBadgeVariant(task.status)}>{task.status ?? '-'}</Badge>
							</Table.Cell>
							<Table.Cell class="p-3">{formatDate(task.created_at, true)}</Table.Cell>
							<Table.Cell class="p-3">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button variant="ghost" size="icon" {...props}>
												<EllipsisVerticalIcon class="size-4" />
												<span class="sr-only">Actions</span>
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end" class="w-36">
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/job-queue/${task.id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										{#if task.job_id}
											<DropdownMenu.Item>
												{#snippet child({ props })}
													<a href={`/jobs/${task.job_id}`} {...props}>View Job</a>
												{/snippet}
											</DropdownMenu.Item>
										{/if}
										{#if task.status === 'completed'}
											<DropdownMenu.Item>
												{#snippet child({ props })}
													<a href={`/job-queue/${task.id}/diff`} {...props}>Compare</a>
												{/snippet}
											</DropdownMenu.Item>
										{/if}
										{#if task.status === 'waiting'}
											<DropdownMenu.Separator />
											<DropdownMenu.Item variant="destructive">
												<form
													method="POST"
													action="?/cancel"
													class="w-full"
													use:enhance={createToastEnhance({
														success: ({ formData }) => {
															const id = String(formData.get('id') ?? '').trim();
															return `Task ${id || ''} canceled successfully.`.trim();
														},
														error: 'Failed to cancel task.'
													})}
												>
													<input type="hidden" name="id" value={task.id} />
													<button type="submit" class="w-full text-left">Cancel</button>
												</form>
											</DropdownMenu.Item>
										{/if}
										{#if canUnstuckTask(task)}
											<DropdownMenu.Separator />
											<DropdownMenu.Item>
												<form
													method="POST"
													action="?/unstuck"
													class="w-full"
													use:enhance={createToastEnhance({
														success: ({ formData }) => {
															const id = String(formData.get('id') ?? '').trim();
															return `Task ${id || ''} moved to waiting.`.trim();
														},
														error: 'Failed to unstuck task.'
													})}
												>
													<input type="hidden" name="id" value={task.id} />
													<button type="submit" class="w-full text-left">Unstuck</button>
												</form>
											</DropdownMenu.Item>
										{/if}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
</div>
