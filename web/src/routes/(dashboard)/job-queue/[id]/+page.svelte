<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ScoreChart, { type ScoreChartItem } from '$lib/components/chart-radial-score.svelte';
	import DnsRecords from '$lib/components/dns-records.svelte';
	import ScoreToolResults from '$lib/components/score-tool-results.svelte';
	import type { Tool } from '$lib/types';
	import type { ApiCommonScoreResult, ApiDomainResult, ApiQueueTask } from '$lib/types/api';
	import type { JobView } from '$lib/types/view';
	import { formatDate } from '$lib/utils';
  	import { ScrollArea } from '$lib/components/ui/scroll-area';
  	import * as Table from '$lib/components/ui/table';
	import ThumbsDownIcon from "@lucide/svelte/icons/thumbs-down";
	import ThumbsUpIcon from "@lucide/svelte/icons/thumbs-up";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  	import * as Alert from '$lib/components/ui/alert';
	import { createToastEnhance } from '$lib/form-toast';

	let { data, form } = $props();
	const task = $derived(data.task as ApiQueueTask & { id: string; job: string });
	const job = $derived(data.job as JobView & { website_url: string });
	const taskType = $derived(String(data.taskType ?? '') as Tool);

	const statusBadgeVariant = (status?: string) => {
		switch (status) {
			case 'completed':
				return 'secondary';
			case 'failed':
			case 'canceled':
				return 'destructive';
			case 'processing':
			case 'waiting':
				return 'default';
			case 'pending':
			default:
				return 'outline';
		}
	};

	const scoreItems = $derived.by(() => {
		const result = data.toolResult as ApiCommonScoreResult & { device?: string } | null;
		if (!result || !data.isScoreTool) return [] as ScoreChartItem[];

		const score = Number(result.score);
		if (!Number.isFinite(score)) return [] as ScoreChartItem[];

		const label =
			taskType === 'wcag'
				? `WCAG${result.device ? ` (${String(result.device)})` : ''}`
				: taskType.toUpperCase();

		return [
			{
				tool: taskType === 'wcag' ? `wcag_${String(result.device ?? 'default')}` : taskType,
				label,
				score
			}
		];
	});
</script>

<div class="p-4 lg:p-6 space-y-4">
	<h2 class="text-xl font-semibold">Queue Task Details</h2>

	{#if data.resultError}
		<p class="text-sm text-destructive">{data.resultError}</p>
	{/if}
	{#if form?.cancel_error}
		<p class="text-sm text-destructive">{form.cancel_error}</p>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<span>Task</span>
				<Badge variant="outline">{String(task.type ?? '-')}</Badge>
				<Badge variant={statusBadgeVariant(String(task.status ?? ''))}>
					{String(task.status ?? 'pending')}
				</Badge>
			</Card.Title>
			<Card.Description>
				Created {formatDate(String(task.created_at ?? ''), true)}
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4 md:grid-cols-2">
			<div class="space-y-1">
				<p class="text-sm text-muted-foreground">Website</p>
				<p class="text-sm break-all">{String(job.website_url ?? '-')}</p>
			</div>
			<div class="space-y-1">
				<p class="text-sm text-muted-foreground">Target</p>
				<p class="text-sm break-all">{String(task.target ?? '-')}</p>
			</div>
			<div class="space-y-1">
				<p class="text-sm text-muted-foreground">Attempts</p>
				<p class="text-sm">{String(task.attempts ?? '-')}</p>
			</div>
			<div class="space-y-1">
				<p class="text-sm text-muted-foreground">Next Run At</p>
				<p class="text-sm">
					{task.next_run_at ? formatDate(String(task.next_run_at), true) : '-'}
				</p>
			</div>
		</Card.Content>
	</Card.Root>

	{#if data.isScoreTool && scoreItems.length}
	<div class="grid gap-4" class:lg:grid-cols-3={taskType === 'wcag' && data.wcagScreenshotId}>
		<Card.Root>
			<Card.Header>
				<Card.Title>{String(taskType).toUpperCase()} Score</Card.Title>
			</Card.Header>
			<Card.Content>
				<ScoreChart scores={scoreItems} />
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Passes</Table.Head>
							<Table.Head>Warnings</Table.Head>
							<Table.Head>Errors</Table.Head>
							<Table.Head class="text-end">Score</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						<Table.Row>
							<Table.Cell class="text-accent">{task.type === 'security' ? 'N/A' : (data.toolResult as ApiCommonScoreResult).passes}</Table.Cell>
							<Table.Cell class="text-warning">{(data.toolResult as ApiCommonScoreResult).warnings}</Table.Cell>
							<Table.Cell class="text-destructive">{(data.toolResult as ApiCommonScoreResult).errors}</Table.Cell>
							<Table.Cell class="text-end font-semibold">{(data.toolResult as ApiCommonScoreResult).score.toFixed(2)}%</Table.Cell>
						</Table.Row>
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
		{#if taskType === 'wcag' && data.wcagScreenshotId}
		<Card.Root class="lg:col-span-2">
			<Card.Header>
				<Card.Title>Screenshot</Card.Title>
			</Card.Header>
			<Card.Content>
				<ScrollArea class="h-[600px] object-center">
					<div class="rounded-md border p-2">
						<img
							src={`/api/v1/screenshots/${data.wcagScreenshotId}`}
							alt="WCAG screenshot"
							class="w-full h-auto rounded-sm"
						/>
					</div>
				</ScrollArea>
			</Card.Content>
		</Card.Root>
		{/if}
	</div>
	{/if}

	{#if taskType === 'domain' && data.toolResult}
	{@const domain = data.toolResult as ApiDomainResult & { expires_in?: number }}
	<div class="grid lg:grid-cols-3 gap-4">
		<Card.Root>
			<Card.Header class="flex justify-between">
				<Card.Title class="capitalize">Domain Results</Card.Title>
				{#if (domain.expires_in ?? 0) > 0}
				<Badge>expires in {domain.expires_in ?? 0} days</Badge>
				{:else if (domain.expires_in ?? 0) < 0}
				<Badge variant="destructive">expired {Math.abs(domain.expires_in ?? 0)} days ago!</Badge>
				{:else}
				<Badge variant="destructive">expires today!</Badge>
				{/if}
			</Card.Header>
			<Card.Content class="flex flex-col">
				<ul class="md:columns-2 gap-2" style="column-width: 230px;">
					<li class="flex gap-1 items-center"><strong>Registered On:</strong>{formatDate(domain.creationDate!)}</li>
					<li class="flex gap-1 items-center"><strong>Updated On:</strong>{formatDate(domain.updatedDate!)}</li>
					<li class="flex gap-1 items-center"><strong>Expires On:</strong>{formatDate(domain.expirationDate!)}</li>
					{#if domain.isIDN && (domain.punycodeName && domain.punycodeName.length) || (domain.unicodeName && domain.unicodeName.length)}
					<li class="flex gap-1 items-center"><strong>IDN:</strong>
						{#if domain.punycodeName && domain.punycodeName.length}
						<span>{domain.punycodeName}</span>
						{/if}
						{#if domain.unicodeName && domain.unicodeName.length}
						<span>{domain.unicodeName}</span>
						{/if}
					</li>
					{/if}
					<li class="flex gap-1 items-center">
						<strong>Registrar:</strong>
						{#if domain.registrar.url}
						- <Button href={domain.registrar.url} target="_blank" variant="link">{domain.registrar.name}</Button>
						{:else}
						{domain.registrar.name}
						{/if}
						{#if domain.registrar.email}
						- <Button href={`mailto:${domain.registrar.email}`} variant="link">{domain.registrar.email}</Button>
						{/if}
						{#if domain.registrar.phone}
						- <Button href={`tel:${domain.registrar.phone}`} variant="link">{domain.registrar.phone}</Button>
						{/if}
					</li>
				</ul>
				<ul class="flex justify-center my-2">
					<li class="flex gap-2" style="--spacing: 0.375rem;">
						<Badge variant={domain.dnssecEnabled ? "default" : "destructive"} class="text-sm">
						<a href="https://en.wikipedia.org/wiki/Domain_Name_System_Security_Extensions" target="_blank" class="flex gap-1 items-center">DNSSEC
						{#if domain.dnssecEnabled}
						<ThumbsUpIcon size={16} />
						{:else}
						{#if domain.dnssecEnabled ===  null}
						N/A
						{:else}
						<ThumbsDownIcon size={16} />
						{/if}
						{/if}
						</a>
						</Badge>
						<Badge variant={domain.privacyEnabled ? "default" : "destructive"} class="text-sm">
						<a href="https://en.wikipedia.org/wiki/Domain_privacy" target="_blank" class="flex gap-1 items-center">Privacy
						{#if domain.privacyEnabled}
						<ThumbsUpIcon size={16} />
						{:else}
						{#if domain.privacyEnabled ===  null}
						N/A
						{:else}
						<ThumbsDownIcon size={16} />
						{/if}
						{/if}
						</a>
						</Badge>
						<Badge variant={domain.transferLock ? "default" : "destructive"} class="text-sm">
						<a href="https://en.wikipedia.org/wiki/Registrar-Lock" target="_blank" class="flex gap-1 items-center">Transfer Lock
						{#if domain.transferLock}
						<ThumbsUpIcon size={16} />
						{:else}
						{#if domain.transferLock ===  null}
						N/A
						{:else}
						<ThumbsDownIcon size={16} />
						{/if}
						{/if}
						</a>
						</Badge>
					</li>
				</ul>
			</Card.Content>
		</Card.Root>
		<Card.Root class="col-span-2">
			<Card.Header>
				<Card.Title>DNS Records</Card.Title>
			</Card.Header>
			<Card.Content>
				<Alert.Root>
					<TriangleAlertIcon />
					<Alert.Title
					>This is not an exhaustive list, DNS servers often truncate responses (a.k.a. records might be missing)</Alert.Title
					>
				</Alert.Root>
				<DnsRecords domain={data.toolResult as ApiDomainResult} />
			</Card.Content>
		</Card.Root>
	</div>
	{:else if data.isScoreTool && data.toolResult}
		<Card.Root>
			<Card.Header>
				<Card.Title>{String(taskType).toUpperCase()} Findings</Card.Title>
			</Card.Header>
			<Card.Content>
				<ScoreToolResults data={data.toolResult} tool={taskType} />
			</Card.Content>
		</Card.Root>
	{:else if !data.resultError}
		<Card.Root>
			<Card.Header>
				<Card.Title>Result Visualization</Card.Title>
				<Card.Description>
					No dedicated visualization for this tool yet.
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{/if}

	<div class="flex items-center gap-3">
		{#if String(task.status ?? '') === 'waiting'}
			<form
				method="POST"
				action="?/cancel"
				use:enhance={createToastEnhance({
					success: 'Task canceled successfully.',
					error: 'Failed to cancel task.'
				})}
			>
				<Button type="submit" variant="destructive">Cancel Task</Button>
			</form>
		{/if}
		<a href="/job-queue">
			<Button variant="outline">
				<ArrowLeftIcon class="size-4" />
				Back to list
			</Button>
		</a>
		<a href={`/jobs/${String(job.id ?? '')}`}>
			<Button variant="outline">
				<ExternalLinkIcon class="size-4" />
				View Job
			</Button>
		</a>
	</div>
</div>
