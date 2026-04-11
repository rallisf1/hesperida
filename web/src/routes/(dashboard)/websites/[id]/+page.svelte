<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

	let { data, form } = $props();
</script>

<div class="p-4 lg:p-6 space-y-4">
	<h2 class="text-xl font-semibold">Website Details</h2>
	<div class="grid md:grid-cols-2 gap-4">
		<div class="rounded-md border p-4 space-y-2 text-sm">
			<div class="flex justify-between">
				<p><strong>URL:</strong> {data.website.url}</p>
				<Button href={data.website.url} target="_blank" size="sm">Open Website</Button>
			</div>
			<p><strong>Description:</strong> {data.website.description ?? '-'}</p>
			<p><strong>Verification code:</strong> {data.website.verification_code ?? '-'}</p>
			<p><strong>Verified at:</strong> {data.website.verified_at ?? 'Not verified'}</p>
		</div>

		<div class="rounded-md border p-4 space-y-3">
			<h3 class="font-semibold">Owner</h3>
			{#if data.ownerUser}
				<Item.Root>
					<Item.Content>
						<Item.Title>
							{#if data.currentUserRole === 'admin'}
								<a href={`/users/${data.ownerUser.id}`} class="underline">{data.ownerUser.name}</a>
							{:else}
								{data.ownerUser.name}
							{/if}
						</Item.Title>
						<Item.Description>{data.ownerUser.email}</Item.Description>
					</Item.Content>
				</Item.Root>
			{:else}
				<p class="text-sm text-muted-foreground">Owner not found.</p>
			{/if}
		</div>

		<div class="rounded-md border p-4 space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="font-semibold">Members</h3>
			</div>
			{#if data.memberUsers.length === 0}
				<p class="text-sm text-muted-foreground">No invited members.</p>
			{:else}
				<div class="space-y-2">
					{#each data.memberUsers as member (member.id)}
						<Item.Root>
							<Item.Content>
								<Item.Title>
									{#if data.currentUserRole === 'admin'}
										<a href={`/users/${member.id}`} class="underline">{member.name}</a>
									{:else}
										{member.name}
									{/if}
								</Item.Title>
								<Item.Description>{member.email}</Item.Description>
							</Item.Content>
							{#if data.currentUserRole !== 'viewer'}
							<Item.Action>
								<form method="POST" action="?/uninvite">
									<input type="hidden" name="email" value={member.email} />
									<Button type="submit" variant="outline">
										<UserMinusIcon class="size-4" />
										Uninvite
									</Button>
								</form>
							</Item.Action>
							{/if}
						</Item.Root>
					{/each}
				</div>
			{/if}
			{#if form?.uninvite_error}
				<p class="text-sm text-destructive">{form.uninvite_error}</p>
			{/if}
		</div>

		<div class="rounded-md border p-4 space-y-2">
			<Label for="email-invite" class="text-lg font-semibold">Invite User</Label>
			<form method="POST" action="?/invite" class="flex w-full max-w-sm items-center gap-2">
				<Input type="email" id="email-invite" placeholder="user@example.com" />
				<Button type="submit" variant="outline">Invite</Button>
			</form>
			{#if form?.invite_error}
				<p class="text-sm text-destructive">{form.invite_error}</p>
			{/if}
		</div>
	</div>


	<a href="/websites">
		<Button variant="outline">
			<ArrowLeftIcon class="size-4" />
			Back to list
		</Button>
	</a>
</div>
