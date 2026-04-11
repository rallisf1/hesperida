<script lang="ts">
	import { goto } from '$app/navigation';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { setFilterParam } from '$lib/filter';
  import { formatDate } from '$lib/utils.js';

	let { data, form } = $props();
	let typeFilter = $derived<string>(data.initialFilter ?? 'all');

	const typeFilters = $derived.by(() => {
		const values = new Set<string>(['all']);
		for (const task of data.tasks ?? []) {
			if (typeof task.type === 'string' && task.type) values.add(task.type);
		}
		return Array.from(values);
	});

	const filteredTasks = $derived.by(() => {
		const tasks = data.tasks ?? [];
		if (typeFilter === 'all') return tasks;
		return tasks.filter((task: { type?: string }) => task.type === typeFilter);
	});

	const selectFilter = async (filter: string) => {
		typeFilter = filter;
		const next = setFilterParam(new URL(window.location.href), filter, 'all');
		await goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	};
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

	<Tabs.Root value={typeFilter}>
		<Tabs.List>
			{#each typeFilters as type (type)}
				<Tabs.Trigger value={type} onclick={() => void selectFilter(type)}>{type === 'all' ? 'All' : type}</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>

	<div class="overflow-auto rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50">
				<tr>
					<th class="text-left p-3">ID</th>
					<th class="text-left p-3">Type</th>
					<th class="text-left p-3">Target</th>
					<th class="text-left p-3">Status</th>
					<th class="text-left p-3">Created</th>
					<th class="text-left p-3">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if filteredTasks.length === 0}
					<tr><td colspan="6" class="p-3 text-muted-foreground">No queue tasks found.</td></tr>
				{:else}
					{#each filteredTasks as task (task.id)}
						<tr class="border-t">
							<td class="p-3">{task.id}</td>
							<td class="p-3">{task.type ?? '-'}</td>
							<td class="p-3">{task.target ?? '-'}</td>
							<td class="p-3">{task.status ?? '-'}</td>
							<td class="p-3">{formatDate(task.created_at, true)}</td>
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
												<a href={`/job-queue/${task.id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										{#if task.status === 'waiting'}
											<DropdownMenu.Separator />
											<DropdownMenu.Item variant="destructive">
												<form method="POST" action="?/cancel" class="w-full">
													<input type="hidden" name="id" value={task.id} />
													<button type="submit" class="w-full text-left">Cancel</button>
												</form>
											</DropdownMenu.Item>
										{/if}
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
