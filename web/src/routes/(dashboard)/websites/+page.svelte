<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { setFilterParam } from '$lib/filter';
	import { formatDate } from '$lib/utils.js';
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import type { WebsiteView } from '$lib/types/view.js';
	import { createToastEnhance } from '$lib/form-toast';
	import * as Popover from "$lib/components/ui/popover/index.js";

	let { data, form } = $props();
	let verificationFilter = $derived<'all' | 'verified' | 'unverified'>((data.initialFilter ?? 'all') as 'all' | 'verified' | 'unverified');
	let urlSearch = $state('');
	const websiteJobCounts = $derived((data.websiteJobCounts ?? {}) as Record<string, number>);

	let deleteDialog = $state(false);
	let deleteDialogJobCount = $state(0);
	let deleteDialogWebsite: WebsiteView | undefined = $state();
	let verifyDialog = $state(false);
	let verifyDialogWebsite: (WebsiteView & { txt_host?: string }) | undefined = $state();
	let verifyDialogHost = $state('');
	let copyPopover = $state(false);

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


  function triggerDelete(website: WebsiteView): void {
    deleteDialogJobCount = Number(websiteJobCounts[website.id] ?? 0);
	deleteDialogWebsite = website;
	deleteDialog = true;
  }

  function triggerVerify(website: WebsiteView & { txt_host?: string }): void {
	verifyDialogWebsite = website;
	verifyDialogHost = website.txt_host ?? 'hesperida.<domain>';
	verifyDialog = true;
  }

  const copyToClipboard = async (value: string): Promise<void> => {
	if (!value) return;
	try {
		await navigator.clipboard.writeText(value);
	} catch {
		// ignore clipboard errors
	}
  };

  const downloadEmptyFile = (fileName: string): void => {
	if (!fileName) return;
	const blob = new Blob([''], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
  };

  const verificationRecord = $derived(`${verifyDialogHost} TXT ${verifyDialogWebsite?.verification_code}`);
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
	{#if form?.verify_error}
		<p class="text-destructive text-sm">{form.verify_error}</p>
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
												<a href={`/websites/${website.id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/jobs/new?website_id=${website.id}`} {...props}>Add Job</a>
											{/snippet}
										</DropdownMenu.Item>
										{#if !website.verified_at}
											<DropdownMenu.Item>
												<button
													type="button"
													class="w-full text-left"
													onclick={() => triggerVerify(website)}
												>
													Verify
												</button>
											</DropdownMenu.Item>
										{/if}
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive">
											<button
											onclick={() => triggerDelete(website)}
											class='w-full text-left'>
												Delete
											</button>
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

<AlertDialog.Root bind:open={deleteDialog}>
	<AlertDialog.Content size="sm">
		<AlertDialog.Header>
			<AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
			<AlertDialog.Description>
				{#if deleteDialogJobCount}
				This website has {deleteDialogJobCount} job(s).
				Deleting it will also delete all related jobs and results.
				{/if}
				Continue deleting {deleteDialogWebsite?.url}?
			</AlertDialog.Description>
			</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/delete"
				onsubmit={() => {
					deleteDialog = false;
				}}
				use:enhance={createToastEnhance({
					success: ({ formData }) => {
						const url = String(formData.get('url') ?? '').trim();
						return `Website ${url || 'record'} deleted successfully.`;
					},
					error: 'Failed to delete website.'
				})}
			>
				<input type="hidden" name="id" value={deleteDialogWebsite?.id} />
				<input type="hidden" name="url" value={deleteDialogWebsite?.url} />
				<AlertDialog.Action type="submit">Continue</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={verifyDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Verify Website Ownership</AlertDialog.Title>
			<AlertDialog.Description>
				Add either the DNS TXT record or the web root file, then click “Check it”.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="space-y-4">
			<div class="space-y-2">
				<p class="text-sm font-medium">DNS TXT record</p>
				<InputGroup.Root>
					<InputGroup.Input
						readonly
						value={verificationRecord}
					/>
					<InputGroup.Button>
						<Popover.Root bind:open={copyPopover}>
							<Popover.Trigger 
								onclick={() => {copyToClipboard(verificationRecord);setTimeout(() => copyPopover = false, 1000)}}>Copy</Popover.Trigger>
							<Popover.Content side="top" align="center" class="w-fit">Copied!</Popover.Content>
						</Popover.Root>
					</InputGroup.Button>
				</InputGroup.Root>
			</div>

			<div class="space-y-2">
				<p class="text-sm font-medium">Web root file</p>
				<InputGroup.Root>
					<InputGroup.Input
						readonly
						value={`hesperida-${verifyDialogWebsite?.verification_code ?? ''}.txt`}
					/>
					<InputGroup.Button
						type="button"
						onclick={() => downloadEmptyFile(`hesperida-${verifyDialogWebsite?.verification_code ?? ''}.txt`)}
					>
						Download
					</InputGroup.Button>
				</InputGroup.Root>
			</div>
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/verify"
				use:enhance={createToastEnhance({
					success: ({ formData }) => {
						const url = String(formData.get('url') ?? '').trim();
						return `Website ${url || 'record'} verified successfully.`;
					},
					error: 'Website verification failed.'
				})}
				onsubmit={() => {
					verifyDialog = false;
				}}
			>
				<input type="hidden" name="id" value={verifyDialogWebsite?.id} />
				<input type="hidden" name="url" value={verifyDialogWebsite?.url} />
				<AlertDialog.Action type="submit">Check it</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
