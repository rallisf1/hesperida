<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SaveIcon from '@lucide/svelte/icons/save';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { createToastEnhance } from '$lib/form-toast';

	let { form } = $props();
</script>

<div class="space-y-4 p-4 lg:p-6">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">New Notification Channel</h2>
		<Button href="/notifications/channels" variant="outline">
			<ArrowLeftIcon class="size-4" />
			Back
		</Button>
	</div>

	<form
		method="POST"
		action="?/create"
		class="space-y-4 rounded-md border p-4"
		use:enhance={createToastEnhance({
			success: 'Notification channel created successfully.',
			error: 'Unable to create notification channel.'
		})}
	>
		{#if form?.create_error}
			<p class="text-sm text-destructive">{form.create_error}</p>
		{/if}

		<div class="space-y-2">
			<Field.Label for="name">Name</Field.Label>
			<Input id="name" name="name" placeholder="Customer Alerts" required />
		</div>

		<div class="space-y-2">
			<Field.Label for="apprise_url">Apprise URL</Field.Label>
			<Input id="apprise_url" name="apprise_url" placeholder="mailto://user:pass@example.com" required />
			<p class="text-xs text-muted-foreground">
				Need help? Use the
				<a
					class="underline underline-offset-4"
					href="https://appriseit.com/tools/url-builder/"
					target="_blank"
					rel="noreferrer"
				>
					Apprise URL Builder
				</a>.
			</p>
		</div>

		<Button type="submit">
			<SaveIcon class="size-4" />
			Create Channel
		</Button>
	</form>
</div>
