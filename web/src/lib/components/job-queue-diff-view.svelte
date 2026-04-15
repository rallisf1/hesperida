<script lang="ts">
	import { enhance } from '$app/forms';
	import MultiSelect, { type Option } from 'svelte-multiselect';
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as Table from '$lib/components/ui/table';
	import { formatDate } from '$lib/utils';
	import { createDiff, type DiffResult, type DiffClassification } from '$lib/task-diff';

	type DiffData = {
		leftTask: {
			id: string;
			type: string;
			status: string;
			target: string;
			created_at: string;
			job_id: string;
			website_url: string;
		};
		leftResult: unknown;
		candidates: Array<{
			id: string;
			website_url: string;
			created_at: string;
			type: string;
			status: string;
			target: string;
			job_id: string;
			label: string;
		}>;
	};

	type CompareForm = {
		compare_error?: string;
		compare_payload?: {
			task: {
				id: string;
				type: string;
				status: string;
				target: string;
				created_at: string;
				job_id: string;
				website_url: string;
			};
			result: unknown;
		};
	};
	type ComparePayload = NonNullable<CompareForm['compare_payload']>;

	let { data, form }: { data: DiffData; form?: CompareForm | null } = $props();

	const initialLeftTask = $derived(data.leftTask);
	const initialLeftResult = $derived(data.leftResult);
	let sameWebsiteOnly = $state(false);
	let selectedOption = $state<Option | null>(null);
	let leftTask = $derived(initialLeftTask);
	let leftResult = $derived(initialLeftResult);
	let rightTask = $state<ComparePayload['task'] | null>(null);
	let rightResult = $state<unknown>(null);

	const optionValue = (option: Option | null | undefined): string => {
		if (option == null) return '';
		if (typeof option === 'string' || typeof option === 'number') return String(option);
		return String(option.value ?? '');
	};

	const rightOptions = $derived.by(() => {
		const base = sameWebsiteOnly
			? data.candidates.filter((candidate) => candidate.website_url === leftTask.website_url)
			: data.candidates;
		return base.map((candidate) => ({
			value: candidate.id,
			label: `${candidate.website_url} · ${formatDate(candidate.created_at, true)}`
		})) as Option[];
	});

	$effect(() => {
		const payload = form?.compare_payload;
		if (!payload) return;
		rightTask = payload.task;
		rightResult = payload.result;
		const match = rightOptions.find((option) => optionValue(option) === payload.task.id);
		selectedOption = match ?? null;
	});

	const diffResult = $derived.by<DiffResult | null>(() => {
		if (!rightTask || rightResult === null) return null;
		return createDiff(leftTask.type.toLowerCase(), leftResult, rightResult);
	});

	const classificationVariant = (value: DiffClassification) => {
		switch (value) {
			case 'new':
				return 'secondary';
			case 'fixed':
				return 'outline';
			case 'stale':
				return 'default';
			case 'changed':
			default:
				return 'destructive';
		}
	};

	const swap = (): void => {
		if (!rightTask) return;
		const previousLeftTask = leftTask;
		const previousLeftResult = leftResult;
		leftTask = rightTask;
		leftResult = rightResult;
		rightTask = previousLeftTask;
		rightResult = previousLeftResult;
		const match = rightOptions.find((option) => optionValue(option) === rightTask?.id);
		selectedOption = match ?? null;
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Queue Task Diff</h2>
		<Button href={`/job-queue/${leftTask.id}`} variant="outline">Back to Task</Button>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<div class="rounded-md border p-4 space-y-2 text-sm">
			<h3 class="font-semibold">Left Side (Fixed)</h3>
			<p><strong>Website:</strong> {leftTask.website_url}</p>
			<p><strong>Type:</strong> {leftTask.type}</p>
			<p><strong>Status:</strong> {leftTask.status}</p>
			<p><strong>Target:</strong> {leftTask.target || '-'}</p>
			<p><strong>Created:</strong> {formatDate(leftTask.created_at, true)}</p>
		</div>

		<div class="rounded-md border p-4 space-y-3 text-sm">
			<h3 class="font-semibold">Right Side (Select)</h3>
			<div class="space-y-2">
				<Label for="same-website-switch">Same Website only</Label>
				<div class="flex items-center gap-2">
					<Switch id="same-website-switch" bind:checked={sameWebsiteOnly} />
				</div>
			</div>
			<form method="POST" action="?/compare" use:enhance>
				<input type="hidden" name="right_task_id" value={optionValue(selectedOption)} />
				<MultiSelect
					bind:value={selectedOption}
					options={rightOptions}
					maxSelect={1}
					allowEmpty
					placeholder="Select completed task to compare"
				/>
				<div class="mt-3 flex gap-2">
					<Button type="submit" variant="outline" disabled={!selectedOption}>Load Compare</Button>
					<Button
						type="button"
						variant="outline"
						disabled={!rightTask}
						onclick={swap}
					>
						<ArrowLeftRightIcon class="size-4" />
						Swap
					</Button>
				</div>
			</form>
		</div>
	</div>

	{#if form?.compare_error}
		<p class="text-sm text-destructive">{form.compare_error}</p>
	{/if}

	{#if diffResult}
		<div class="grid gap-3 md:grid-cols-4">
			<div class="rounded-md border p-3 text-sm">
				<p class="text-muted-foreground">Changed</p>
				<p class="text-lg font-semibold">{diffResult.summary.changed}</p>
			</div>
			<div class="rounded-md border p-3 text-sm">
				<p class="text-muted-foreground">New</p>
				<p class="text-lg font-semibold">{diffResult.summary.new}</p>
			</div>
			<div class="rounded-md border p-3 text-sm">
				<p class="text-muted-foreground">Fixed</p>
				<p class="text-lg font-semibold">{diffResult.summary.fixed}</p>
			</div>
			<div class="rounded-md border p-3 text-sm">
				<p class="text-muted-foreground">Stale</p>
				<p class="text-lg font-semibold">{diffResult.summary.stale}</p>
			</div>
		</div>

		{#if diffResult.score_delta}
			<div class="rounded-md border p-3 text-sm">
				<p>
					<strong>Score Delta:</strong>
					{diffResult.score_delta.delta.toFixed(2)}
					({diffResult.score_delta.delta_percent === null ? 'n/a' : `${diffResult.score_delta.delta_percent.toFixed(2)}%`})
				</p>
			</div>
		{/if}

		{#if diffResult.latency_delta_ms}
			<div class="rounded-md border p-3 text-sm">
				<p>
					<strong>Latency Delta:</strong>
					{diffResult.latency_delta_ms.delta.toFixed(2)}ms
					({diffResult.latency_delta_ms.delta_percent === null ? 'n/a' : `${diffResult.latency_delta_ms.delta_percent.toFixed(2)}%`})
				</p>
			</div>
		{/if}

		<div class="overflow-auto rounded-md border">
			<Table.Root class="w-full text-sm">
				<Table.Header class="bg-muted/50">
					<Table.Row>
						<Table.Head class="p-3 text-left">Classification</Table.Head>
						<Table.Head class="p-3 text-left">Field</Table.Head>
						<Table.Head class="p-3 text-left">Left</Table.Head>
						<Table.Head class="p-3 text-left">Right</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if diffResult.items.length === 0}
						<Table.Row>
							<Table.Cell colspan={4} class="p-3 text-muted-foreground">No diff items.</Table.Cell>
						</Table.Row>
					{:else}
						{#each diffResult.items as item (item.key)}
							<Table.Row class="border-t">
								<Table.Cell class="p-3">
									<Badge variant={classificationVariant(item.classification)}>{item.classification}</Badge>
								</Table.Cell>
								<Table.Cell class="p-3">
									<div>{item.label}</div>
									{#if item.group}
										<div class="text-xs text-muted-foreground">{item.group}</div>
									{/if}
								</Table.Cell>
								<Table.Cell class="p-3 whitespace-normal md:break-all">{item.left_value ?? '-'}</Table.Cell>
								<Table.Cell class="p-3 whitespace-normal md:break-all">{item.right_value ?? '-'}</Table.Cell>
							</Table.Row>
						{/each}
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>
