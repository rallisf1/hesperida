<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { createToastEnhance } from '$lib/form-toast';
	import { formatDate } from '$lib/utils';

	let { data, form } = $props();
</script>

<div class="space-y-6 p-4 lg:p-6">
	<div class="space-y-2">
		<h2 class="text-xl font-semibold">Notification Channels</h2>
		{#if data.error}
			<p class="text-sm text-destructive">{data.error}</p>
		{/if}
		{#if form?.channel_error}
			<p class="text-sm text-destructive">{form.channel_error}</p>
		{/if}
	</div>

	<div class="flex items-center justify-end">
		<Button href="/notifications/channels/new" size="lg">
			<PlusIcon class="size-4" />
			New Channel
		</Button>
	</div>

	<div class="overflow-auto rounded-md border">
		<Table.Root class="w-full text-sm">
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="p-3 text-left">Name</Table.Head>
					<Table.Head class="p-3 text-left">Apprise URL</Table.Head>
					<Table.Head class="p-3 text-left">Owner</Table.Head>
					<Table.Head class="p-3 text-left">Updated</Table.Head>
					<Table.Head class="p-3 text-left">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if (data.channels ?? []).length === 0}
					<Table.Row>
						<Table.Cell colspan={5} class="p-3 text-muted-foreground">
							No notification channels found.
						</Table.Cell>
					</Table.Row>
				{:else}
					{#each data.channels as channel (channel.id)}
						<Table.Row class="border-t">
							<Table.Cell class="max-w-[16rem] p-3">{channel.name || '-'}</Table.Cell>
							<Table.Cell class="max-w-[28rem] p-3 font-mono text-xs">{channel.apprise_url}</Table.Cell>
							<Table.Cell class="p-3">
								{channel.user_name || channel.user_email
									? `${channel.user_name ?? ''}${channel.user_name && channel.user_email ? ' · ' : ''}${channel.user_email ?? ''}`
									: channel.user_id}
							</Table.Cell>
							<Table.Cell class="p-3">{channel.updated_at ? formatDate(channel.updated_at, true) : '-'}</Table.Cell>
							<Table.Cell class="p-3">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button variant="ghost" size="icon" {...props}>
												<EllipsisVerticalIcon class="size-4" />
												<span class="sr-only">Channel actions</span>
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end" class="w-44">
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/notifications/channels/${channel.id}/edit`} {...props}>Edit</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											<form
												method="POST"
												action="?/testChannel"
												use:enhance={createToastEnhance({
													success: 'Test notification sent.',
													error: 'Unable to send test notification.'
												})}
												class="w-full"
											>
												<input type="hidden" name="id" value={channel.id} />
												<button type="submit" class="w-full text-left">Test</button>
											</form>
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive">
											<form
												method="POST"
												action="?/deleteChannel"
												use:enhance={createToastEnhance({
													success: 'Channel deleted successfully.',
													error: 'Unable to delete notification channel.'
												})}
												class="w-full"
											>
												<input type="hidden" name="id" value={channel.id} />
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

