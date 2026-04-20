<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { createToastEnhance } from '$lib/form-toast';
	import { getNextUtcRunIso } from '$lib/cron';
	import cronstrue from 'cronstrue';
	import { formatDate } from '$lib/utils';

	let { data, form } = $props();
	let deleteDialogOpen = $state(false);

	const nextRunUtc = $derived(getNextUtcRunIso(data.schedule.cron));

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

	const linkedTools = $derived(data.linkedJob?.types ?? data.schedule.job_types ?? []);

	const describeCron = (cron: string): string => {
		try {
			return cronstrue.toString(cron, { use24HourTimeFormat: true });
		} catch {
			return 'Invalid cron expression';
		}
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Schedule Details</h2>
		<div class="flex items-center gap-2">
			<Button href="/schedule" variant="outline">
				<ArrowLeftIcon class="size-4" />
				Back
			</Button>
			{#if data.canManage}
				<Button href={`/schedule/${data.schedule.id}/edit`}>
					<PencilIcon class="size-4" />
					Edit
				</Button>
				<Button type="button" variant="destructive" onclick={() => (deleteDialogOpen = true)}>
					<TrashIcon class="size-4" />
					Delete
				</Button>
			{/if}
		</div>
	</div>

	{#if form?.delete_error}
		<p class="text-sm text-destructive">{form.delete_error}</p>
	{/if}

	<div class="rounded-md border p-4 text-sm space-y-2">
		<p><strong>Website:</strong> {data.schedule.website_url || '-'}</p>
		<p>
			<strong>Linked Job:</strong>
			<Button variant="link" href="/jobs/{data.schedule.job_id}" class="font-mono">
				{data.schedule.job_id}
			</Button>
		</p>
		<p>
			<strong>Linked Job Tools:</strong>
			<span class="ml-2 inline-flex flex-wrap gap-1 align-middle">
				{#if linkedTools.length === 0}
					<span>-</span>
				{:else}
					{#each linkedTools as tool (tool)}
						<Badge variant="outline">{tool}</Badge>
					{/each}
				{/if}
			</span>
		</p>
		<p>
			<strong>Cron (UTC):</strong>
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<span class="ml-2 cursor-help underline decoration-dotted underline-offset-2">
							{describeCron(data.schedule.cron)}
						</span>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p class="font-mono text-xs">{data.schedule.cron}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		</p>
		<p>
			<strong>Enabled:</strong>
			<Badge variant={data.schedule.enabled ? 'default' : 'outline'} class="ml-2">
				{data.schedule.enabled ? 'Yes' : 'No'}
			</Badge>
		</p>
		<p><strong>Next run:</strong> {nextRunUtc ? formatDate(nextRunUtc, true) : 'Invalid cron'}</p>
		<p><strong>Created:</strong> {formatDate(data.schedule.created_at, true)}</p>
		<p><strong>Updated:</strong> {formatDate(data.schedule.updated_at, true)}</p>
	</div>

	<div class="space-y-2">
		<h3 class="text-base font-semibold">Runs</h3>
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
					{#if (data.schedule.created_jobs ?? []).length === 0}
						<Table.Row>
							<Table.Cell colspan={5} class="p-3 text-muted-foreground">No runs available.</Table.Cell>
						</Table.Row>
					{:else}
						{#each data.schedule.created_jobs ?? [] as job (job.id)}
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
										<DropdownMenu.Content align="end" class="w-32">
											<DropdownMenu.Item>
												{#snippet child({ props })}
													<a href={`/jobs/${job.id}`} {...props}>View</a>
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
</div>

<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete Schedule</AlertDialog.Title>
			<AlertDialog.Description>This action cannot be undone.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/delete"
				use:enhance={createToastEnhance({
					success: 'Schedule deleted successfully.',
					error: 'Failed to delete schedule.'
				})}
			>
				<AlertDialog.Action type="submit">Delete</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
