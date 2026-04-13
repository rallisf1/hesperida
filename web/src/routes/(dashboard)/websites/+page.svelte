<script lang="ts">
	import { goto } from '$app/navigation';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';
	import { setFilterParam } from '$lib/filter';
  	import { formatDate } from '$lib/utils.js';

	let { data, form } = $props();
	let verificationFilter = $derived<'all' | 'verified' | 'unverified'>((data.initialFilter ?? 'all') as 'all' | 'verified' | 'unverified');
	let urlSearch = $state('');

	const filteredWebsites = $derived.by(() => {
		const websites = data.websites ?? [];
		const byVerification =
			verificationFilter === 'all'
				? websites
				: verificationFilter === 'verified'
					? websites.filter((website) => !!website.verified_at)
					: websites.filter((website) => !website.verified_at);

		const query = urlSearch.trim().toLowerCase();
		if (!query) return byVerification;
		return byVerification.filter((website) =>
			String(website.url ?? '')
				.toLowerCase()
				.includes(query)
		);
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

	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<Tabs.Root value={verificationFilter}>
			<Tabs.List>
				<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
				<Tabs.Trigger value="verified" onclick={() => void selectFilter('verified')}>Verified</Tabs.Trigger>
				<Tabs.Trigger value="unverified" onclick={() => void selectFilter('unverified')}>Unverified</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
		<Input
			type="search"
			class="w-full md:w-72"
			placeholder="Search by URL"
			bind:value={urlSearch}
		/>
	</div>

	<div class="overflow-auto rounded-md border">
		<Table.Root class="w-full text-sm">
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="text-left p-3">URL</Table.Head>
					<Table.Head class="text-left p-3">Verified</Table.Head>
					<Table.Head class="text-left p-3">Created</Table.Head>
					<Table.Head class="text-left p-3">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if filteredWebsites.length === 0}
					<Table.Row><Table.Cell colspan={4} class="p-3 text-muted-foreground">No websites found.</Table.Cell></Table.Row>
				{:else}
					{#each filteredWebsites as website (website.id)}
						{@const website_id = website.id?.toString().split(':')[1]}
						<Table.Row class="border-t">
							<Table.Cell class="p-3">{website.url}</Table.Cell>
							<Table.Cell class="p-3">{website.verified_at ? formatDate(website.verified_at) : 'No'}</Table.Cell>
							<Table.Cell class="p-3">{formatDate(website.created_at)}</Table.Cell>
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
									<DropdownMenu.Content align="end" class="w-40">
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/websites/${website_id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/jobs/new?website_id=${website_id}`} {...props}>Add Job</a>
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
							</Table.Cell>
						</Table.Row>
					{/each}
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
</div>
