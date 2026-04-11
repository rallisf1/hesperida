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
	let roleFilter = $derived<'all' | 'admin' | 'editor' | 'viewer'>(
		(data.initialFilter ?? 'all') as 'all' | 'admin' | 'editor' | 'viewer'
	);

	const filteredUsers = $derived.by(() => {
		const users = data.users ?? [];
		if (roleFilter === 'all') return users;
		return users.filter((user: { role?: string }) => user.role === roleFilter);
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

	<Tabs.Root value={roleFilter}>
		<Tabs.List>
			<Tabs.Trigger value="all" onclick={() => void selectFilter('all')}>All</Tabs.Trigger>
			<Tabs.Trigger value="admin" onclick={() => void selectFilter('admin')}>Admin</Tabs.Trigger>
			<Tabs.Trigger value="editor" onclick={() => void selectFilter('editor')}>Editor</Tabs.Trigger>
			<Tabs.Trigger value="viewer" onclick={() => void selectFilter('viewer')}>Viewer</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	<div class="overflow-auto rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50">
				<tr>
					<th class="text-left p-3">Name</th>
					<th class="text-left p-3">Email</th>
					<th class="text-left p-3">Role</th>
					<th class="text-left p-3">Created</th>
					<th class="text-left p-3">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if filteredUsers.length === 0}
					<tr><td colspan="5" class="p-3 text-muted-foreground">No users found.</td></tr>
				{:else}
					{#each filteredUsers as user (user.id)}
						<tr class="border-t">
							<td class="p-3">{user.name}</td>
							<td class="p-3">{user.email}</td>
							<td class="p-3 capitalize">{user.role ?? '-'}</td>
							<td class="p-3">{formatDate(user.created_at)}</td>
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
											<form method="POST" action="?/reset_password" class="w-full">
												<input type="hidden" name="email" value={user.email} />
												<button type="submit" class="w-full text-left">Reset password</button>
											</form>
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive">
											<form method="POST" action="?/delete" class="w-full">
												<input type="hidden" name="id" value={user.id} />
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
