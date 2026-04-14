<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table';
	import MultiSelect, { type Option } from 'svelte-multiselect';
	import { setFilterParam } from '$lib/filter';
	import { createToastEnhance } from '$lib/form-toast';
	import { formatDate } from '$lib/utils.js';

	let { data, form } = $props();
	let roleFilter = $derived<'all' | 'admin' | 'editor' | 'viewer'>(
		(data.initialFilter ?? 'all') as 'all' | 'admin' | 'editor' | 'viewer'
	);
	let selectedGroup = $state<Option | null>(null);

	const optionValue = (option: Option | null | undefined): string => {
		if (option == null) return '';
		if (typeof option === 'string' || typeof option === 'number') return String(option);
		return String(option.value ?? '');
	};

	const groupOptions = $derived.by(() => {
		if (!data.isSuperuser) return [] as Option[];
		const groups = [...new Set((data.users ?? []).map((user) => String(user.group ?? '').trim()).filter(Boolean))];
		groups.sort((a, b) => a.localeCompare(b));
		return groups.map((group) => ({ label: group, value: group })) as Option[];
	});

	const filteredUsers = $derived.by(() => {
		const users = data.users ?? [];
		const byRole =
			roleFilter === 'all'
				? users
				: users.filter((user: { role?: string }) => user.role === roleFilter);

		if (!data.isSuperuser) return byRole;
		const selectedGroupValue = optionValue(selectedGroup).trim();
		if (!selectedGroupValue) return byRole;
		return byRole.filter((user: { group?: string }) => String(user.group ?? '') === selectedGroupValue);
	});

	const selectFilter = async (filter: 'all' | 'admin' | 'editor' | 'viewer') => {
		roleFilter = filter;
		const next = setFilterParam(new URL(window.location.href), filter, 'all');
		await goto(next, { replaceState: true, noScroll: true, keepFocus: true });
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Users</h2>
		<a href="/users/new">
			<Button size="lg">
				<PlusIcon class="size-4" />
				New User
			</Button>
		</a>
	</div>

	{#if data.error}
		<p class="text-destructive text-sm">{data.error}</p>
	{/if}
	{#if form?.delete_error}
		<p class="text-destructive text-sm">{form.delete_error}</p>
	{/if}
	{#if form?.reset_error}
		<p class="text-destructive text-sm">{form.reset_error}</p>
	{/if}
	{#if form?.reset_success}
		<p class="text-sm text-emerald-700">Password reset email sent.</p>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<Tabs.Root value={roleFilter}>
			<Tabs.List>
				<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
				<Tabs.Trigger value="admin" onclick={() => void selectFilter('admin')}>Admin</Tabs.Trigger>
				<Tabs.Trigger value="editor" onclick={() => void selectFilter('editor')}>Editor</Tabs.Trigger>
				<Tabs.Trigger value="viewer" onclick={() => void selectFilter('viewer')}>Viewer</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
		{#if data.isSuperuser}
			<div class="w-full md:w-72">
				<MultiSelect
					bind:value={selectedGroup}
					options={groupOptions}
					maxSelect={1}
					allowEmpty
					placeholder="Filter by group"
				/>
			</div>
		{/if}
	</div>

	<div class="overflow-auto rounded-md border">
		<Table.Root class="w-full text-sm">
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="text-left p-3">Name</Table.Head>
					<Table.Head class="text-left p-3">Email</Table.Head>
					<Table.Head class="text-left p-3">Role</Table.Head>
					{#if data.isSuperuser}
						<Table.Head class="text-left p-3">Group</Table.Head>
					{/if}
					<Table.Head class="text-left p-3">Created</Table.Head>
					<Table.Head class="text-left p-3">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if filteredUsers.length === 0}
					<Table.Row><Table.Cell colspan={data.isSuperuser ? 6 : 5} class="p-3 text-muted-foreground">No users found.</Table.Cell></Table.Row>
				{:else}
					{#each filteredUsers as user}
						<Table.Row class="border-t">
							<Table.Cell class="p-3">{user.name}</Table.Cell>
							<Table.Cell class="p-3">{user.email}</Table.Cell>
							<Table.Cell class="p-3 capitalize">{user.role ?? '-'}</Table.Cell>
							{#if data.isSuperuser}
								<Table.Cell class="p-3">{user.group || '-'}</Table.Cell>
							{/if}
							<Table.Cell class="p-3">{formatDate(user.created_at)}</Table.Cell>
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
												<a href={`/users/${user.id}`} {...props}>View</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a href={`/users/${user.id}/edit`} {...props}>Edit</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											<form
												method="POST"
												action="?/reset_password"
												class="w-full"
												use:enhance={createToastEnhance({
													success: ({ formData }) => {
														const name = String(formData.get('name') ?? '').trim();
														const email = String(formData.get('email') ?? '').trim();
														return `Password reset sent to ${name || email}.`;
													},
													error: 'Failed to send password reset email.'
												})}
											>
												<input type="hidden" name="email" value={user.email} />
												<input type="hidden" name="name" value={user.name} />
												<button type="submit" class="w-full text-left">Reset password</button>
											</form>
										</DropdownMenu.Item>
									<DropdownMenu.Separator />
									{#if !user.is_superuser && user.id !== data.currentUserId}
										<DropdownMenu.Item variant="destructive">
											<form
												method="POST"
												action="?/delete"
												class="w-full"
												use:enhance={createToastEnhance({
													success: ({ formData }) => {
														const name = String(formData.get('name') ?? '').trim();
														return `User ${name || 'account'} deleted successfully.`;
													},
													error: 'Failed to delete user.'
												})}
											>
												<input type="hidden" name="id" value={user.id} />
												<input type="hidden" name="name" value={user.name} />
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
