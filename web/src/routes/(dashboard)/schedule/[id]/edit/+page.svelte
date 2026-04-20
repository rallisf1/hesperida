<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SaveIcon from '@lucide/svelte/icons/save';
	import MultiSelect, { type Option } from 'svelte-multiselect';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { createToastEnhance } from '$lib/form-toast';
	import { formatDate } from '$lib/utils';

	let { data, form } = $props();

	let selectedWebsite = $state<Option | null>(null);
	let selectedJobId = $state<string>('');
	let cronValue = $derived<string>(data.schedule.cron ?? '0 0 * * *');
	let enabled = $state<boolean>(true);

	const optionValue = (option: Option | null | undefined): string => {
		if (option == null) return '';
		if (typeof option === 'string' || typeof option === 'number') return String(option);
		return String(option.value ?? '');
	};

	const optionLabel = (option: Option | null | undefined): string => {
		if (option == null) return '';
		if (typeof option === 'string' || typeof option === 'number') return String(option);
		return String(option.label ?? option.value ?? '');
	};

	const websiteOptions = $derived.by(() => {
		const unique = [...new Set((data.jobs ?? []).map((job) => String(job.website_id ?? '').trim()).filter(Boolean))];
		return unique
			.map((websiteId) => {
				const anyJob = (data.jobs ?? []).find((job) => job.website_id === websiteId);
				return {
					value: websiteId,
					label: anyJob?.website_url || websiteId
				} as Option;
			})
			.sort((a, b) => optionLabel(a).localeCompare(optionLabel(b)));
	});

	$effect(() => {
		const initialId = String(data.initialWebsiteId ?? '').trim();
		if (!selectedWebsite && initialId) {
			const found = websiteOptions.find((item) => optionValue(item) === initialId);
			if (found) selectedWebsite = found;
		}
	});

	const filteredJobs = $derived.by(() => {
		const websiteId = optionValue(selectedWebsite).trim();
		if (!websiteId.length) return data.jobs ?? [];
		return (data.jobs ?? []).filter((job) => String(job.website_id ?? '') === websiteId);
	});

	const jobsByWebsite = $derived.by(() => {
		const grouped = new Map<string, typeof filteredJobs>();
		for (const job of filteredJobs) {
			const key = String(job.website_id ?? '');
			const current = grouped.get(key) ?? [];
			current.push(job);
			grouped.set(key, current);
		}

		for (const [key, jobs] of grouped.entries()) {
			jobs.sort(
				(a, b) =>
					new Date(String(b.created_at ?? '')).getTime() -
					new Date(String(a.created_at ?? '')).getTime()
			);
			grouped.set(key, jobs);
		}

		return grouped;
	});

	$effect(() => {
		if (!selectedJobId) {
			selectedJobId = String(data.schedule.job_id ?? '');
		}
		if (!cronValue.trim().length) {
			cronValue = String(data.schedule.cron ?? '0 0 * * *');
		}
		enabled = Boolean(data.schedule.enabled);
	});

	$effect(() => {
		if (selectedJobId && !filteredJobs.some((job) => String(job.id) === selectedJobId)) {
			selectedJobId = String(filteredJobs[0]?.id ?? selectedJobId);
		}
	});

	const onCronInput = (event: Event) => {
		const detail = (event as CustomEvent<{ value?: string }>).detail;
		const value = String(detail?.value ?? '').trim();
		if (value.length) cronValue = value;
	};
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/cron-input-ui@2.5.0/dist/cron-input-ui.min.css">
	<script src="https://unpkg.com/cron-input-ui@2.5.0/dist/cron-input-ui.min.js" async></script>
	<script src="https://unpkg.com/cron-input-ui@2.5.0/dist/locales/en.js" async></script>
</svelte:head>

<style>
	:global {
		.cronInput {
			max-width: 320px;
		}
		.cronButton > svg {
			fill: var(--foreground);
		}
		.cronSave > svg {
			fill: var(--accent);
		}
		.cronClose > svg {
			fill: var(--destructive);
		}
	}
</style>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Edit Schedule</h2>
		<div class="flex gap-2 items-center">
			<Button href={`/schedule/${data.schedule.id}`} variant="outline">
				<ArrowLeftIcon class="size-4" />
				Back
			</Button>
		</div>
	</div>

	{#if form?.update_error}
		<p class="text-sm text-destructive">{form.update_error}</p>
	{/if}

	<form
		method="POST"
		action="?/update"
		class="rounded-md border p-4 space-y-4"
		use:enhance={createToastEnhance({
			success: 'Schedule updated successfully.',
			error: 'Failed to update schedule.'
		})}
	>
		<div class="space-y-2">
			<Field.Label>Website</Field.Label>
			<MultiSelect
				bind:value={selectedWebsite}
				options={websiteOptions}
				maxSelect={1}
				allowEmpty
				placeholder="Filter jobs by website"
				disabled={!data.canManage}
			/>
		</div>

		<div class="space-y-2">
			<Field.Label for="job">Linked Job (completed only)</Field.Label>
			<Select.Root name="job" type="single" bind:value={selectedJobId} disabled={!data.canManage || filteredJobs.length === 0}>
				<Select.Trigger class="w-full" id="job">
					{#if selectedJobId}
						{@const selected = (filteredJobs ?? []).find((job) => job.id === selectedJobId)}
						{selected ? `${selected.website_url || 'Unknown website'} · ${formatDate(selected.created_at, true)}` : 'Select job'}
					{:else}
						Select job
					{/if}
				</Select.Trigger>
				<Select.Content>
					{#if jobsByWebsite.size === 0}
						<Select.Item value="" disabled>No completed jobs available</Select.Item>
					{:else}
						{#each Array.from(jobsByWebsite.entries()) as [websiteId, jobs] (websiteId)}
							{@const websiteLabel = jobs[0]?.website_url || websiteId}
							<Select.Group>
								<Select.GroupHeading>{websiteLabel}</Select.GroupHeading>
								{#each jobs as job (job.id)}
									<Select.Item value={job.id}>
										{formatDate(job.created_at, true)}
									</Select.Item>
								{/each}
							</Select.Group>
						{/each}
					{/if}
				</Select.Content>
			</Select.Root>
		</div>

		<div class="space-y-2">
			<Field.Label for="cron-input">Cron (UTC)</Field.Label>
			<div class="rounded-md border bg-background p-2">
				<cron-input-ui
					id="cron-input"
					value={cronValue}
					name="_cron_widget"
					width="100%"
					height="40px"
					color="hsl(var(--primary))"
					show-message
					hot-validate
					oninput={onCronInput}
				></cron-input-ui>
			</div>
			<input type="hidden" name="cron" value={cronValue} />
		</div>

		<div class="flex items-center gap-2">
			<Checkbox id="enabled" name="enabled" bind:checked={enabled} disabled={!data.canManage} />
			<label for="enabled" class="text-sm">Enabled</label>
		</div>

		<input type="hidden" name="job" value={selectedJobId} />

		{#if data.canManage}
			<div>
				<Button type="submit" disabled={!selectedJobId || !cronValue.trim().length}>
					<SaveIcon class="size-4" />
					Save Changes
				</Button>
			</div>
		{/if}
	</form>
</div>
