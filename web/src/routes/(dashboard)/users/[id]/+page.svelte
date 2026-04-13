<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table';
  	import { formatDate } from '$lib/utils.js';

	let { data } = $props();
	let websiteFilter = $state<'owner' | 'member'>('owner');

	const filteredWebsites = $derived.by(() => {
		const websites = data.websites ?? [];
		if (websiteFilter === 'owner') return websites.filter((website: { isOwner?: boolean }) => !!website.isOwner);
		return websites.filter((website: { isMember?: boolean }) => !!website.isMember);
	});
</script>

<div class="p-4 lg:p-6 max-w-4xl space-y-4">
	<h2 class="text-xl font-semibold">User Details</h2>

	<div class="rounded-md border p-4 space-y-2 text-sm">
		<p><strong>Name:</strong> {data.user.name}</p>
		<p><strong>Email:</strong> {data.user.email}</p>
		<p class="capitalize"><strong>Role:</strong> {data.user.role ?? '-'}</p>
		<p><strong>Created:</strong> {formatDate(data.user.created_at, true)}</p>
	</div>

	<div class="flex items-center gap-3">
		<a href={`/users/${data.user.id}/edit`}>
			<Button>
				<PencilIcon class="size-4" />
				Edit
			</Button>
		</a>
		<a href="/users">
			<Button variant="outline">
				<ArrowLeftIcon class="size-4" />
				Back to list
			</Button>
		</a>
	</div>

	<div class="space-y-3">
		<h3 class="text-base font-semibold">Websites</h3>
		<Tabs.Root value={websiteFilter}>
			<Tabs.List>
				<Tabs.Trigger value="owner" onclick={() => (websiteFilter = 'owner')}>Owner</Tabs.Trigger>
				<Tabs.Trigger value="member" onclick={() => (websiteFilter = 'member')}>Member</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

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
						<Table.Row><Table.Cell colspan={4} class="p-3 text-muted-foreground">No websites found for this filter.</Table.Cell></Table.Row>
					{:else}
						{#each filteredWebsites as website (website.id)}
							<Table.Row class="border-t">
								<Table.Cell class="p-3">{website.url}</Table.Cell>
								<Table.Cell class="p-3">{website.verified_at ? formatDate(website.verified_at) : 'No'}</Table.Cell>
								<Table.Cell class="p-3">{formatDate(website.created_at)}</Table.Cell>
								<Table.Cell class="p-3">
									<a href={`/websites/${website.id}`} class="underline">View</a>
								</Table.Cell>
							</Table.Row>
						{/each}
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	</div>
</div>
