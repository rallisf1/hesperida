<script lang="ts">
	import { goto } from '$app/navigation';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { setFilterParam } from '$lib/filter';
  	import { formatDate } from '$lib/utils.js';

	let { data, form } = $props();
	let verificationFilter = $derived<'all' | 'verified' | 'unverified'>((data.initialFilter ?? 'all') as 'all' | 'verified' | 'unverified');

	const filteredWebsites = $derived.by(() => {
		const websites = data.websites ?? [];
		if (verificationFilter === 'all') return websites;
		if (verificationFilter === 'verified') {
			return websites.filter(website => !!website.verified_at);
		}
		return websites.filter(website => !website.verified_at);
	});

	const selectFilter = async (filter: 'all' | 'verified' | 'unverified') => {
		verificationFilter = filter;
		const next = setFilterParam(new URL(window.location.href), filter, 'all');
		await goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Websites</h2>
		<a href="/websites/new">
			<Button size="lg">
				<PlusIcon class="size-4" />
				New Website
			</Button>
		</a>
	</div>

	{#if data.error}
		<p class="text-destructive text-sm">{data.error}</p>
	{/if}
	{#if form?.delete_error}
		<p class="text-destructive text-sm">{form.delete_error}</p>
	{/if}

	<Tabs.Root value={verificationFilter}>
		<Tabs.List>
			<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
			<Tabs.Trigger value="verified" onclick={() => void selectFilter('verified')}>Verified</Tabs.Trigger>
			<Tabs.Trigger value="unverified" onclick={() => void selectFilter('unverified')}>Unverified</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	<div class="overflow-auto rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50">
				<tr>
					<th class="text-left p-3">URL</th>
					<th class="text-left p-3">Verified</th>
					<th class="text-left p-3">Created</th>
					<th class="text-left p-3">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if filteredWebsites.length === 0}
					<tr><td colspan="4" class="p-3 text-muted-foreground">No websites found.</td></tr>
				{:else}
					{#each filteredWebsites as website (website.id)}
						{@const website_id = website.id?.toString().split(':')[1]}
						<tr class="border-t">
							<td class="p-3">{website.url}</td>
							<td class="p-3">{website.verified_at ? formatDate(website.verified_at) : 'No'}</td>
							<td class="p-3">{formatDate(website.created_at)}</td>
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
												<a href={`/websites/${website_id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive">
											<form method="POST" action="?/delete" class="w-full">
												<input type="hidden" name="id" value={website_id} />
												<button type="submit" class="w-full text-left">Delete</button>
											</form>
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
