<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
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
		<p><strong>Role:</strong> {data.user.role ?? '-'}</p>
		<p><strong>Created:</strong> {formatDate(data.user.created_at)}</p>
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
						<tr><td colspan="4" class="p-3 text-muted-foreground">No websites found for this filter.</td></tr>
					{:else}
						{#each filteredWebsites as website (website.id)}
							<tr class="border-t">
								<td class="p-3">{website.url}</td>
								<td class="p-3">{website.verified_at ? formatDate(website.verified_at) : 'No'}</td>
								<td class="p-3">{formatDate(website.created_at)}</td>
								<td class="p-3">
									<a href={`/websites/${website.id}`} class="underline">View</a>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
