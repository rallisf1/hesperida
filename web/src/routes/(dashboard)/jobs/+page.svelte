<script lang="ts">
	import { goto } from '$app/navigation';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { setFilterParam } from '$lib/filter';
  import { formatDate } from '$lib/utils.js';

	let { data } = $props();
	let statusFilter = $derived<'all' | 'pending' | 'processing' | 'completed' | 'failed'>((data.initialFilter ?? 'all') as 'all' | 'pending' | 'processing' | 'completed' | 'failed');

	const filteredJobs = $derived.by(() => {
		const jobs = data.jobs ?? [];
		if (statusFilter === 'all') return jobs;
		return jobs.filter((job: { status?: string }) => job.status === statusFilter);
	});

	const selectFilter = async (filter: 'all' | 'pending' | 'processing' | 'completed' | 'failed') => {
		statusFilter = filter;
		const next = setFilterParam(new URL(window.location.href), filter, 'all');
		await goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Jobs</h2>
		<a href="/jobs/new">
			<Button>
				<PlusIcon class="size-4" />
				New Job
			</Button>
		</a>
	</div>

	{#if data.error}
		<p class="text-sm text-destructive">{data.error}</p>
	{/if}

	<Tabs.Root value={statusFilter}>
		<Tabs.List>
			<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
			<Tabs.Trigger value="pending" onclick={() => void selectFilter('pending')}>Pending</Tabs.Trigger>
			<Tabs.Trigger value="processing" onclick={() => void selectFilter('processing')}>Processing</Tabs.Trigger>
			<Tabs.Trigger value="completed" onclick={() => void selectFilter('completed')}>Completed</Tabs.Trigger>
			<Tabs.Trigger value="failed" onclick={() => void selectFilter('failed')}>Failed</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	<div class="overflow-auto rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50">
				<tr>
					<th class="text-left p-3">ID</th>
					<th class="text-left p-3">Tools</th>
					<th class="text-left p-3">Status</th>
					<th class="text-left p-3">Created</th>
					<th class="text-left p-3">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if filteredJobs.length === 0}
					<tr><td colspan="5" class="p-3 text-muted-foreground">No jobs found.</td></tr>
				{:else}
					{#each filteredJobs as job (job.id)}
						<tr class="border-t">
							<td class="p-3">{job.id}</td>
							<td class="p-3">{(job.types ?? []).join(', ') || '-'}</td>
							<td class="p-3">{job.status ?? '-'}</td>
							<td class="p-3">{formatDate(job.created_at)}</td>
							<td class="p-3">
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
												<a href={`/jobs/${job.id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/jobs/${job.id}/edit`} {...props}>Edit</a>
											{/snippet}
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>
