<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { createToastEnhance } from '$lib/form-toast';

	let { data, form } = $props();

	let website = $state(data.websitePreset || data.websites?.[0]?.id || '');
	let notificationChannel = $state(data.channels?.[0]?.id || '');
	let jobCompleted = $state(Boolean(data.defaultEvents.JOB_COMPLETED));
	let jobFailed = $state(Boolean(data.defaultEvents.JOB_FAILED));
	let seoScoreBelow = $state('');
	let stressScoreBelow = $state('');
	let wcagScoreBelow = $state('');
	let securityScoreBelow = $state('');
</script>

<div class="space-y-4 p-4 lg:p-6">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">New Website Notification Link</h2>
		<Button href="/notifications/websites" variant="outline">
			<ArrowLeftIcon class="size-4" />
			Back
		</Button>
	</div>

	<form
		method="POST"
		action="?/create"
		class="space-y-4 rounded-md border p-4"
		use:enhance={createToastEnhance({
			success: 'Website notification link created successfully.',
			error: 'Unable to create website notification link.'
		})}
	>
		{#if data.error}
			<p class="text-sm text-destructive">{data.error}</p>
		{/if}
		{#if form?.create_error}
			<p class="text-sm text-destructive">{form.create_error}</p>
		{/if}

		<div class="grid gap-4 md:grid-cols-2">
			<div class="space-y-2">
				<Field.Label for="website">Website</Field.Label>
				<select
					id="website"
					name="website"
					class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
					bind:value={website}
					required
				>
					<option value="" disabled>Select website</option>
					{#each data.websites ?? [] as item (item.id)}
						<option value={item.id}>{item.url}</option>
					{/each}
				</select>
			</div>
			<div class="space-y-2">
				<Field.Label for="notification_channel">Notification Channel</Field.Label>
				<select
					id="notification_channel"
					name="notification_channel"
					class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
					bind:value={notificationChannel}
					required
				>
					<option value="" disabled>Select channel</option>
					{#each data.channels ?? [] as item (item.id)}
						<option value={item.id}>{item.name || item.apprise_url}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="space-y-3">
			<Field.Label>Events</Field.Label>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="flex items-center gap-2 text-sm">
					<Checkbox name="JOB_COMPLETED" bind:checked={jobCompleted} />
					Job completed
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox name="JOB_FAILED" bind:checked={jobFailed} />
					Job failed
				</label>
			</div>
			<div class="grid gap-4 md:grid-cols-2">
				<div class="space-y-1">
					<Field.Label for="SEO_SCORE_BELOW">SEO score below</Field.Label>
					<Input
						id="SEO_SCORE_BELOW"
						type="number"
						min="0"
						max="100"
						step="0.1"
						bind:value={seoScoreBelow}
						disabled={!jobCompleted}
					/>
				</div>
				<div class="space-y-1">
					<Field.Label for="STRESS_SCORE_BELOW">Stress score below</Field.Label>
					<Input
						id="STRESS_SCORE_BELOW"
						type="number"
						min="0"
						max="100"
						step="0.1"
						bind:value={stressScoreBelow}
						disabled={!jobCompleted}
					/>
				</div>
				<div class="space-y-1">
					<Field.Label for="WCAG_SCORE_BELOW">WCAG score below</Field.Label>
					<Input
						id="WCAG_SCORE_BELOW"
						type="number"
						min="0"
						max="100"
						step="0.1"
						bind:value={wcagScoreBelow}
						disabled={!jobCompleted}
					/>
				</div>
				<div class="space-y-1">
					<Field.Label for="SECURITY_SCORE_BELOW">Security score below</Field.Label>
					<Input
						id="SECURITY_SCORE_BELOW"
						type="number"
						min="0"
						max="100"
						step="0.1"
						bind:value={securityScoreBelow}
						disabled={!jobCompleted}
					/>
				</div>
			</div>
		</div>

		<input type="hidden" name="SEO_SCORE_BELOW" value={seoScoreBelow} />
		<input type="hidden" name="STRESS_SCORE_BELOW" value={stressScoreBelow} />
		<input type="hidden" name="WCAG_SCORE_BELOW" value={wcagScoreBelow} />
		<input type="hidden" name="SECURITY_SCORE_BELOW" value={securityScoreBelow} />

		<Button type="submit">
			<PlusIcon class="size-4" />
			Create Link
		</Button>
	</form>
</div>
