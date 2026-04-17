<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from "$lib/components/ui/select/index.js";
	import { createToastEnhance } from '$lib/form-toast';

	let { data, form } = $props();

	let selectedRole = $derived(form?.values?.role ?? data.user.role);
	const isSuperuserTarget = $derived(Boolean(data.user.is_superuser));
</script>

<div class="p-4 lg:p-6 max-w-xl space-y-4">
	<h2 class="text-xl font-semibold">Create User</h2>
	<p class="text-sm text-muted-foreground">The user will receive a reset email to set their password.</p>

	{#if form?.error}
		<p class="text-sm text-destructive">{form.error}</p>
	{/if}

	<form
		method="POST"
		class="space-y-3"
		use:enhance={createToastEnhance({
			success: ({ formData }) => {
				const name = String(formData.get('name') ?? '').trim();
				const email = String(formData.get('email') ?? '').trim();
				return `User ${name || email} updated successfully.`;
			},
			error: 'Failed to update user.'
		})}
	>
		<div class="flex w-full max-w-sm flex-col gap-1.5">
			<Label for="name" class="text-lg">Name</Label>
			<Input id="name" name="name" placeholder="John Doe" value={form?.values?.name ?? data.user.name} class="h-10" />
		</div>
		<div class="flex w-full max-w-sm flex-col gap-1.5">
			<Label for="email" class="text-lg">Email</Label>
			<Input id="email" type="email" name="email" placeholder="user@example.com" value={form?.values?.email ?? data.user.email} class="h-10" />
		</div>
		<div class="flex w-full max-w-sm flex-col gap-1.5">
			<Label for="role" class="text-lg">Role</Label>
			{#if isSuperuserTarget}
				<input type="hidden" name="role" value="admin" />
				<Input id="role" value="Admin" readonly class="h-10 capitalize" />
			{:else}
				<Select.Root type="single" name="role" bind:value={selectedRole}>
					<Select.Trigger id="role" class="h-8! capitalize">{selectedRole}</Select.Trigger>
					<Select.Content align="start">
						{#if data.currentUserRole === "admin"}
							<Select.Item value="admin">Admin</Select.Item>
						{/if}
						<Select.Item value="editor">Editor</Select.Item>
						<Select.Item value="viewer">Viewer</Select.Item>
					</Select.Content>
				</Select.Root>
			{/if}
		</div>
		<div class="flex items-center gap-3">
			<Button type="submit" size="lg">Save</Button>
			<Button href="/users" size="lg" variant="outline">Cancel</Button>
		</div>
	</form>
</div>
