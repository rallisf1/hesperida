<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import MultiSelect, { type Option } from 'svelte-multiselect';
	import cronstrue from 'cronstrue';
	import { createToastEnhance } from '$lib/form-toast';
	import { setFilterParam } from '$lib/filter';
	import { getNextUtcRunIso } from '$lib/cron';

	let { data, form } = $props();
	let filter = $derived<'all' | 'enabled' | 'disabled'>(
		(data.initialFilter ?? 'all') as 'all' | 'enabled' | 'disabled'
	);
	let selectedWebsite = $state<Option | null>(null);

	const optionValue = (option: Option | null | undefined): string => {
		if (option == null) return '';
		if (typeof option === 'string' || typeof option === 'number') return String(option);
		return String(option.value ?? '');
	};

	const websiteOptions = $derived.by(() => {
		const uniqueUrls = [
			...new Set(
				(data.schedules ?? [])
					.map((item) => String(item.website_url ?? '').trim())
					.filter(Boolean)
			)
		];
		uniqueUrls.sort((a, b) => a.localeCompare(b));
		return uniqueUrls.map((url) => ({ label: url, value: url })) as Option[];
	});

	const formatNextRunServer = (cron: string): string => {
		const next = getNextUtcRunIso(cron);
		if (!next) return 'Invalid cron';
		const date = new Date(next);
		if (Number.isNaN(date.getTime())) return 'Invalid cron';
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: data.serverTimeZone || 'UTC'
		}).format(date);
	};

	const describeCron = (cron: string): string => {
		try {
			return cronstrue.toString(cron, { use24HourTimeFormat: true });
		} catch {
			return 'Invalid cron expression';
		}
	};

	const filteredSchedules = $derived.by(() => {
		const schedules = data.schedules ?? [];
		const byStatus =
			filter === 'enabled'
				? schedules.filter((item: { enabled?: boolean }) => item.enabled)
				: filter === 'disabled'
					? schedules.filter((item: { enabled?: boolean }) => !item.enabled)
					: schedules;

		const websiteUrl = optionValue(selectedWebsite).trim();
		if (!websiteUrl.length) return byStatus;
		return byStatus.filter((item: { website_url?: string }) => String(item.website_url ?? '') === websiteUrl);
	});

	const selectFilter = async (nextFilter: 'all' | 'enabled' | 'disabled') => {
		filter = nextFilter;
		const next = setFilterParam(new URL(window.location.href), nextFilter, 'all');
		await goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Schedule</h2>
		{#if data.canManage}
			<Button href="/schedule/new">
				<PlusIcon class="size-4" />
				New Schedule
			</Button>
		{/if}
	</div>

	{#if data.error}
		<p class="text-sm text-destructive">{data.error}</p>
	{/if}
	{#if form?.delete_error}
		<p class="text-sm text-destructive">{form.delete_error}</p>
	{/if}
	{#if data.websiteFilter || data.jobFilter}
		<p class="text-sm text-muted-foreground">
			Filtered by
			{#if data.websiteFilter}
				website <span class="font-mono">{data.websiteFilter}</span>
			{/if}
			{#if data.websiteFilter && data.jobFilter}
				and
			{/if}
			{#if data.jobFilter}
				job <span class="font-mono">{data.jobFilter}</span>
			{/if}
		</p>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<Tabs.Root value={filter}>
			<Tabs.List>
				<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
				<Tabs.Trigger value="enabled" onclick={() => void selectFilter('enabled')}>Enabled</Tabs.Trigger>
				<Tabs.Trigger value="disabled" onclick={() => void selectFilter('disabled')}>Disabled</Tabs.Trigger>
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
					<Table.Head class="text-left p-3">Website</Table.Head>
					<Table.Head class="text-left p-3">Tools</Table.Head>
					<Table.Head class="text-left p-3">Cron</Table.Head>
					<Table.Head class="text-left p-3">Enabled</Table.Head>
					<Table.Head class="text-left p-3">Next run</Table.Head>
					<Table.Head class="text-left p-3">Runs</Table.Head>
					<Table.Head class="text-left p-3">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if filteredSchedules.length === 0}
					<Table.Row>
						<Table.Cell colspan={7} class="p-3 text-muted-foreground">No schedules found.</Table.Cell>
					</Table.Row>
				{:else}
					{#each filteredSchedules as schedule (schedule.id)}
						<Table.Row class="border-t">
							<Table.Cell class="p-3">{schedule.website_url || '-'}</Table.Cell>
							<Table.Cell class="p-3">
								<div class="flex flex-wrap gap-1">
									{#if (schedule.job_types ?? []).length === 0}
										<span>-</span>
									{:else}
										{#each schedule.job_types ?? [] as tool (tool)}
											<Badge variant="outline">{tool}</Badge>
										{/each}
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell class="p-3">
								<Tooltip.Provider>
									<Tooltip.Root>
										<Tooltip.Trigger>
											<span class="cursor-help underline decoration-dotted underline-offset-2">
												{describeCron(schedule.cron)}
											</span>
										</Tooltip.Trigger>
										<Tooltip.Content>
											<p class="font-mono text-xs">{schedule.cron}</p>
										</Tooltip.Content>
									</Tooltip.Root>
								</Tooltip.Provider>
							</Table.Cell>
							<Table.Cell class="p-3">
								<Badge variant={schedule.enabled ? 'default' : 'outline'}>
									{schedule.enabled ? 'Yes' : 'No'}
								</Badge>
							</Table.Cell>
							<Table.Cell class="p-3">{formatNextRunServer(schedule.cron)}</Table.Cell>
							<Table.Cell class="p-3">{Number(schedule.runs_count ?? schedule.created.length ?? 0)}</Table.Cell>
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
									<DropdownMenu.Content align="end" class="w-44">
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/schedule/${schedule.id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										{#if data.canManage}
											<DropdownMenu.Item>
												{#snippet child({ props })}
													<a href={`/schedule/${schedule.id}/edit`} {...props}>Edit</a>
												{/snippet}
											</DropdownMenu.Item>
										{/if}
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/jobs/${schedule.job_id}`} {...props}>View Base Job</a>
											{/snippet}
										</DropdownMenu.Item>
										{#if data.canManage}
											<DropdownMenu.Separator />
											<DropdownMenu.Item variant="destructive">
												<form
													method="POST"
													action="?/delete"
													use:enhance={createToastEnhance({
														success: 'Schedule deleted successfully.',
														error: 'Failed to delete schedule.'
													})}
													class="w-full"
												>
													<input type="hidden" name="id" value={schedule.id} />
													<button type="submit" class="w-full text-left">Delete</button>
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
