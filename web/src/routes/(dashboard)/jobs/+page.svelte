<script lang="ts">
	import { goto } from '$app/navigation';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table';
	import MultiSelect, { type Option } from 'svelte-multiselect';
	import { setFilterParam } from '$lib/filter';
	import { formatDate } from '$lib/utils.js';

	let { data } = $props();
	let statusFilter = $derived<'all' | 'pending' | 'processing' | 'completed' | 'failed'>((data.initialFilter ?? 'all') as 'all' | 'pending' | 'processing' | 'completed' | 'failed');
	let selectedWebsite = $state<Option | null>(null);

	const optionValue = (option: Option | null | undefined): string => {
		if (option == null) return '';
		if (typeof option === 'string' || typeof option === 'number') return String(option);
		return String(option.value ?? '');
	};

	const websiteOptions = $derived.by(() => {
		const uniqueUrls = [...new Set((data.jobs ?? []).map((job) => String(job.website_url ?? '').trim()).filter(Boolean))];
		uniqueUrls.sort((a, b) => a.localeCompare(b));
		return uniqueUrls.map((url) => ({ label: url, value: url })) as Option[];
	});

	const filteredJobs = $derived.by(() => {
		const jobs = data.jobs ?? [];
		const byStatus =
			statusFilter === 'all'
				? jobs
				: jobs.filter((job: { status?: string }) => job.status === statusFilter);

		const selectedWebsiteUrl = optionValue(selectedWebsite).trim();
		if (!selectedWebsiteUrl) return byStatus;
		return byStatus.filter((job: { website_url?: string }) => String(job.website_url ?? '') === selectedWebsiteUrl);
	});

	const statusBadgeVariant = (status?: string) => {
		switch (status) {
			case 'completed':
				return 'secondary';
			case 'failed':
				return 'destructive';
			case 'processing':
				return 'default';
			case 'pending':
			default:
				return 'outline';
		}
	};

	const selectFilter = async (filter: 'all' | 'pending' | 'processing' | 'completed' | 'failed') => {
		statusFilter = filter;
		const next = setFilterParam(new URL(window.location.href), filter, 'all');
		await goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Jobs</h2>
		<Button href="/jobs/new" size="lg">
			<PlusIcon class="size-4" />
			New Job
		</Button>
	</div>

	{#if data.error}
		<p class="text-sm text-destructive">{data.error}</p>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<Tabs.Root value={statusFilter}>
			<Tabs.List>
				<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
				<Tabs.Trigger value="pending" onclick={() => void selectFilter('pending')}>Pending</Tabs.Trigger>
				<Tabs.Trigger value="processing" onclick={() => void selectFilter('processing')}>Processing</Tabs.Trigger>
				<Tabs.Trigger value="completed" onclick={() => void selectFilter('completed')}>Completed</Tabs.Trigger>
				<Tabs.Trigger value="failed" onclick={() => void selectFilter('failed')}>Failed</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
		<div class="w-full md:w-72">
			<MultiSelect
				bind:value={selectedWebsite}
				options={websiteOptions}
				maxSelect={1}
				allowEmpty
				placeholder="Filter by website"
			/>
		</div>
	</div>

	<div class="overflow-auto rounded-md border">
		<Table.Root class="w-full text-sm">
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="text-left p-3">Website URL</Table.Head>
					<Table.Head class="text-left p-3">Tools</Table.Head>
					<Table.Head class="text-left p-3">Status</Table.Head>
					<Table.Head class="text-left p-3">Created</Table.Head>
					<Table.Head class="text-left p-3">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if filteredJobs.length === 0}
					<Table.Row><Table.Cell colspan={5} class="p-3 text-muted-foreground">No jobs found.</Table.Cell></Table.Row>
				{:else}
					{#each filteredJobs as job (job.id)}
						<Table.Row class="border-t">
							<Table.Cell class="p-3">{job.website_url || '-'}</Table.Cell>
							<Table.Cell class="p-3">
								<div class="flex flex-wrap gap-1">
									{#if (job.types ?? []).length === 0}
										<span>-</span>
									{:else}
										{#each job.types ?? [] as tool (tool)}
											<Badge variant="outline">{tool}</Badge>
										{/each}
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell class="p-3">
								<Badge variant={statusBadgeVariant(job.status)}>{job.status ?? 'pending'}</Badge>
							</Table.Cell>
							<Table.Cell class="p-3">{formatDate(job.created_at, true)}</Table.Cell>
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
												<a href={`/jobs/${job.id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/schedule/new?website_id=${job.website_id}`} {...props}>Add schedule</a>
											{/snippet}
										</DropdownMenu.Item>
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
