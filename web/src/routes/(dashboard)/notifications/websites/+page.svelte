<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import MultiSelect, { type Option } from 'svelte-multiselect';
	import { createToastEnhance } from '$lib/form-toast';
	import { describeWebsiteNotificationEvents } from '$lib/website-notification-events';
    import * as Tabs from '$lib/components/ui/tabs/index.js';
    import { setFilterParam } from '$lib/filter.js';
    import { goto } from '$app/navigation';
  import type { ApiWebsiteNotification } from '$lib/types/api.js';

	let { data, form } = $props();
	let statusFilter = $derived<'all' | 'completed' | 'failed'>((data.initialFilter ?? 'all') as 'all' | 'completed' | 'failed');
	let selectedWebsite = $state<Option | null>(null);

	const optionValue = (option: Option | null | undefined): string => {
		if (option == null) return '';
		if (typeof option === 'string' || typeof option === 'number') return String(option);
		return String(option.value ?? '');
	};

	const websiteOptions = $derived.by(() => {
		const uniqueUrls = [...new Set((data.links ?? []).map((link) => String(link.website_url ?? '').trim()).filter(Boolean))];
		uniqueUrls.sort((a, b) => a.localeCompare(b));
		return uniqueUrls.map((url) => ({ label: url, value: url })) as Option[];
	});

	const filteredLinks = $derived.by(() => {
		const links = data.links ?? [];
		//@ts-ignore-error
		const byStatus = statusFilter === 'all' ? links : links.filter((link: { events?: ApiWebsiteNotification }) => link.events[`JOB_${statusFilter.toUpperCase()}`] === true);
		const selectedWebsiteUrl = optionValue(selectedWebsite).trim();
		if (!selectedWebsiteUrl) return byStatus;
		return byStatus.filter((link: { website_url?: string }) => String(link.website_url ?? '') === selectedWebsiteUrl);
	});

	const selectFilter = async (filter: 'all' | 'completed' | 'failed') => {
		statusFilter = filter;
		const next = setFilterParam(new URL(window.location.href), filter, 'all');
		await goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Website Notification Links</h2>
		<Button href="/notifications/websites/new" size="lg">
			<PlusIcon class="size-4" />
			New Website Link
		</Button>
	</div>

	{#if data.error || form?.link_error}
		<p class="text-sm text-destructive">{data.error ?? form?.link_error}</p>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<Tabs.Root value={statusFilter}>
			<Tabs.List>
				<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
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
					<Table.Head class="p-3 text-left">Website</Table.Head>
					<Table.Head class="p-3 text-left">Channel</Table.Head>
					<Table.Head class="p-3 text-left">Events</Table.Head>
					<Table.Head class="p-3 text-left">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if filteredLinks.length === 0}
					<Table.Row>
						<Table.Cell colspan={4} class="p-3 text-muted-foreground">
							No website notification links found.
						</Table.Cell>
					</Table.Row>
				{:else}
					{#each filteredLinks as link (link.id)}
						<Table.Row class="border-t">
							<Table.Cell class="p-3">{link.website_url || link.website_id}</Table.Cell>
							<Table.Cell class="max-w-[24rem] p-3">
								{link.channel_name || link.notification_channel_id}
							</Table.Cell>
							<Table.Cell class="p-3">
								<div class="flex flex-wrap gap-1">
									{#each describeWebsiteNotificationEvents(link.events) as eventLabel (eventLabel)}
										<Badge variant="outline">{eventLabel}</Badge>
									{/each}
								</div>
							</Table.Cell>
							<Table.Cell class="p-3">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button variant="ghost" size="icon" {...props}>
												<EllipsisVerticalIcon class="size-4" />
												<span class="sr-only">Website link actions</span>
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end" class="w-44">
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/notifications/websites/${link.id}/edit`} {...props}>Edit</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive">
											<form
												method="POST"
												action="?/deleteLink"
												use:enhance={createToastEnhance({
													success: 'Website link deleted successfully.',
													error: 'Unable to delete website link.'
												})}
												class="w-full"
											>
												<input type="hidden" name="id" value={link.id} />
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
