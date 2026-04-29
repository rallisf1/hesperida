<script lang="ts">
	import { source } from "sveltekit-sse";
	import { onDestroy, onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import SearchIcon from "@lucide/svelte/icons/search";
	import AccessibilityIcon from "@lucide/svelte/icons/accessibility";
	import ChartLineIcon from "@lucide/svelte/icons/chart-line";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import ThumbsDownIcon from "@lucide/svelte/icons/thumbs-down";
	import ThumbsUpIcon from "@lucide/svelte/icons/thumbs-up";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import WrenchIcon from "@lucide/svelte/icons/wrench";
	import { AreaChart, BarChart, Area, Bars } from "layerchart";
	import { scaleUtc } from "d3-scale";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Chart from "$lib/components/ui/chart/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
	import DataTable from "$lib/components/data-table.svelte";
	import type { QueueTaskRow, QueueTaskStreamEvent } from "$lib/queue-tasks";
	import { buttonVariants } from "$lib/components/ui/button/index.js";
	import type { Tool } from "$lib/types.js";
  	import { formatDate } from "$lib/utils.js";
	import { localeStore } from "$lib/stores.js";

	type ScorePoint = { job_id: string; website_url: string; score: number; created_at: string } | null;

	let { data } = $props();
	let tasks = $state<QueueTaskRow[]>([]);
	let seededFromLoad = $state(false);

	$effect(() => {
		if (seededFromLoad) return;
		tasks = data.tasks ?? [];
		seededFromLoad = true;
	});

	const sortByCreatedAt = (rows: QueueTaskRow[]): QueueTaskRow[] =>
		[...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

	const upsertTask = (rows: QueueTaskRow[], task: QueueTaskRow): QueueTaskRow[] => {
		const idx = rows.findIndex((item) => item.id === task.id);
		if (idx === -1) return sortByCreatedAt([...rows, task]);
		const copy = [...rows];
		copy[idx] = task;
		return sortByCreatedAt(copy);
	};

	const removeTask = (rows: QueueTaskRow[], id: string): QueueTaskRow[] =>
		rows.filter((task) => task.id !== id);

	let connection: ReturnType<typeof source> | null = null;
	let unsubscribe: (() => void) | null = null;

	onMount(() => {
		connection = source("/streams/job-queue", {
			options: {
				headers: {
					"X-Accel-Buffering": 'no',
				},
			},
		});
		const stream = connection.select("job_queue").json<QueueTaskStreamEvent>();
		unsubscribe = stream.subscribe((event) => {
			if (!event) return;
			if (event.type === "snapshot") {
				tasks = sortByCreatedAt(event.tasks);
				return;
			}
			if (event.type === "upsert") {
				tasks = upsertTask(tasks, event.task);
				return;
			}
			if (event.type === "remove") {
				tasks = removeTask(tasks, event.id);
			}
		});
	});

	let queueHealth = $derived.by(() => {
		return tasks.reduce<{ waiting: number; processing: number; failed: number }>(
			(acc, row) => {
				if (row.status === 'waiting') acc.waiting += 1;
				if (row.status === 'processing') acc.processing += 1;
				if (row.status === 'failed') acc.failed += 1;
				return acc;
			},
			{ waiting: 0, processing: 0, failed: 0 }
		);
	});
	
	onDestroy(() => {
		unsubscribe?.();
		connection?.close();
	});

	const cancelTask = async (task: QueueTaskRow) => {
		if (task.status !== "waiting") return;

		const previous = tasks;
		tasks = upsertTask(tasks, { ...task, status: "canceled" });

		const response = await fetch(`/job-queue/${task.id}/cancel`, {
			method: "POST",
		});

		if (!response.ok) {
			tasks = previous;
			toast.error("Failed to cancel task.");
			return;
		}

		toast.success("Task canceled.");
	};

	const compactDate = (value: string): string => {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat($localeStore, {
			month: "short",
			day: "2-digit",
		}).format(date);
	};

	const formatTwoDigits = (value: number): string =>
		new Intl.NumberFormat($localeStore, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);

	const scoreText = (point: ScorePoint, tool: Tool): string =>
		point ? `${formatTwoDigits(point.score)}% · <a href="/jobs/${point.job_id}#${tool}" class="ml-1 hover:underline">${point.website_url}</a>` : "No data";

	const throughputChart = $derived(
		(data.throughput ?? []).map((item: { date: string; completed: number; non_completed: number }) => ({
			date: new Date(item.date),
			completed: item.completed,
			non_completed: item.non_completed
		}))
	);

	const throughputConfig = {
		completed: { label: "Completed", color: "var(--chart-2)" },
		non_completed: { label: "Non-completed", color: "var(--chart-5)" }
	} satisfies Chart.ChartConfig;

	const toolUsageConfig = {
		count: { label: "Count", color: "var(--chart-2)" }
	} satisfies Chart.ChartConfig;
</script>

<div class="@container/main flex flex-1 flex-col gap-2">
	<div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
		{#if data.unverifiedCount > 0}
		<div class="px-4 lg:px-6">
			<Alert.Root variant="destructive">
				<Alert.Description class="flex items-center px-1">
					<TriangleAlertIcon size="18" />
					<strong class="px-2">Hey!</strong>
					There are {data.unverifiedCount} unverified websites.
					<a href="/websites?filter=unverified" class="underline font-medium ml-1">Click here to view them.</a>
				</Alert.Description>
			</Alert.Root>
		</div>
		{/if}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 px-4 lg:px-6">
			<Card.Root class="relative">
				<Card.Header>
					<div class="flex items-center justify-between gap-2">
						<Card.Title class="text-base flex items-center gap-2">
							<GlobeIcon class="size-5" />
							Latest Websites
						</Card.Title>
						<Tooltip.Provider>
							<Tooltip.Root>
								<a href="/websites/new">
									<Tooltip.Trigger class={buttonVariants({ variant: "default" })}>
										<PlusIcon class="size-4" />
									</Tooltip.Trigger>
								</a>
								<Tooltip.Content>
									<p>Add a new Website</p>
								</Tooltip.Content>
							</Tooltip.Root>
						</Tooltip.Provider>
					</div>
				</Card.Header>
				<Card.Content>
					{#if data.latestWebsites.length}
						<ul class="space-y-2 text-sm">
							{#each data.latestWebsites as website (website.id + website.created_at)}
								<li class="flex items-center justify-between gap-2">
									<a href={`/websites/${website.id}`} class="truncate hover:underline">{website.url}</a>
									<span class="text-muted-foreground shrink-0">{compactDate(website.created_at)}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-muted-foreground text-sm">No websites yet.</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base flex items-center gap-2">
						<SearchIcon class="size-5" />
						SEO
					</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2">
					<Alert.Root>
						<Alert.Description class="text-sm flex items-center px-1">
							<ThumbsUpIcon size="18" />
							<strong class="px-2">Best</strong>
							{@html scoreText(data.seo.best, "seo")}
						</Alert.Description>
					</Alert.Root>
					<Alert.Root variant="destructive">
						<Alert.Description class="text-sm flex items-center px-1">
							<ThumbsDownIcon size="18" />
							<strong class="px-2">Worst!</strong>
							{@html scoreText(data.seo.worst, "seo")}
						</Alert.Description>
					</Alert.Root>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base flex items-center gap-2">
						<AccessibilityIcon class="size-5" />
						WCAG
					</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm space-y-2">
					<Alert.Root>
						<Alert.Description class="text-sm flex items-center px-1">
							<ThumbsUpIcon size="18" />
							<strong class="px-2">Best</strong>
							{@html scoreText(data.wcag.best, "wcag")}
						</Alert.Description>
					</Alert.Root>
					<Alert.Root variant="destructive">
						<Alert.Description class="text-sm flex items-center px-1">
							<ThumbsDownIcon size="18" />
							<strong class="px-2">Worst!</strong>
							{@html scoreText(data.wcag.worst, "wcag")}
						</Alert.Description>
					</Alert.Root>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base flex items-center gap-2">
						<ShieldIcon class="size-5" />
						Security
					</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm space-y-2">
					<Alert.Root>
						<Alert.Description class="text-sm flex items-center px-1">
							<ThumbsUpIcon size="18" />
							<strong class="px-2">Best</strong>
							{@html scoreText(data.security.best, "security")}
						</Alert.Description>
					</Alert.Root>
					<Alert.Root variant="destructive">
						<Alert.Description class="text-sm flex items-center px-1">
							<ThumbsDownIcon size="18" />
							<strong class="px-2">Worst!</strong>
							{@html scoreText(data.security.worst, "security")}
						</Alert.Description>
					</Alert.Root>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base flex items-center gap-2">
						<GaugeIcon class="size-5" />
						Latency
					</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm space-y-2">
					<Alert.Root>
						<Alert.Description class="text-sm flex items-center px-1">
							<ThumbsUpIcon size="18" />
							<strong class="px-2">Best</strong>
							{#if data.probe?.best}
							{formatTwoDigits(data.probe?.best.latency_ms)} ms · <a href="/jobs/${data.probe?.best.job_id}" class="ml-1 hover:underline">{data.probe?.best.website_url}</a>
							{:else}
							No data
							{/if}
						</Alert.Description>
					</Alert.Root>
					<Alert.Root variant="destructive">
						<Alert.Description class="text-sm flex items-center px-1">
							<ThumbsDownIcon size="18" />
							<strong class="px-2">Worst!</strong>
							{#if data.probe?.worst}
							{formatTwoDigits(data.probe?.worst.latency_ms)} ms · <a href="/jobs/${data.probe?.worst.job_id}" class="ml-1 hover:underline">{data.probe?.worst.website_url}</a>
							{:else}
							No data
							{/if}
						</Alert.Description>
					</Alert.Root>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base flex items-center gap-2">
						<ActivityIcon class="size-5" />
						<a href="/job-queue" class="hover:underline">Queue Health</a>
					</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm grid grid-cols-3 gap-3">
					<div>
						<div class="text-muted-foreground">Waiting</div>
						<div class="text-base font-semibold">{Number(queueHealth.waiting ?? 0)}</div>
					</div>
					<div>
						<div class="text-muted-foreground">Processing</div>
						<div class="text-base font-semibold">{Number(queueHealth.processing ?? 0)}</div>
					</div>
					<div>
						<div class="text-muted-foreground">Failed</div>
						<div class="text-base font-semibold text-amber-700">{Number(queueHealth.failed ?? 0)}</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="grid gap-4 lg:grid-cols-2 px-4 lg:px-6">
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex gap-2 items-center"><ChartLineIcon class="size-5" /> Daily Task Throughput</Card.Title>
					<Card.Description>Last 14 days · completed vs non-completed</Card.Description>
				</Card.Header>
				<Card.Content class="h-64">
					<Chart.Container config={throughputConfig} class="h-full w-full">
						<AreaChart
							data={throughputChart}
							x="date"
							xScale={scaleUtc()}
							series={[
								{ key: "completed", label: "Completed", color: throughputConfig.completed.color },
								{ key: "non_completed", label: "Non-completed", color: throughputConfig.non_completed.color }
							]}
							seriesLayout="stack"
							props={{
								xAxis: { format: (v) => compactDate(v.toISOString()) }
							}}
						>
							{#snippet marks({ visibleSeries, getAreaProps })}
								{#each visibleSeries as s, i (s.key)}
									<Area {...getAreaProps(s, i)} fillOpacity={0.35} />
								{/each}
							{/snippet}
							{#snippet tooltip()}
								<Chart.Tooltip labelFormatter={(v: Date) => formatDate(v.toISOString())} />
							{/snippet}
						</AreaChart>
					</Chart.Container>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="flex gap-2 items-center"><WrenchIcon class="size-5" />Tool Usage by Job</Card.Title>
					<Card.Description>Most used scan tools (latest jobs)</Card.Description>
				</Card.Header>
				<Card.Content class="h-64">
					{#if data.toolUsage.length}
						<Chart.Container config={toolUsageConfig} class="h-full w-full">
							<BarChart
								data={data.toolUsage as { tool: string; count: number }[]}
								x="tool"
								y="count"
								series={[{ key: "count", label: "Count", color: toolUsageConfig.count.color }]}
							>
								{#snippet marks({ visibleSeries, getBarsProps })}
									{#each visibleSeries as s, i (s.key)}
										<Bars {...getBarsProps(s, i)} />
									{/each}
								{/snippet}
								{#snippet tooltip()}
									<Chart.Tooltip labelFormatter={(v: string) => v.toUpperCase()} />
								{/snippet}
							</BarChart>
						</Chart.Container>
					{:else}
						<p class="text-muted-foreground text-sm">No tool usage data yet.</p>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>

		<DataTable rows={tasks} enableRowDrag={false} enableRowSelect={false} onCancelTask={cancelTask} />
	</div>
</div>
