<script lang="ts">
	import { source } from "sveltekit-sse";
	import { onDestroy, onMount } from "svelte";
	import SectionCards from "$lib/components/section-cards.svelte";
	import ChartAreaInteractive from "$lib/components/chart-area-interactive.svelte";
	import DataTable from "$lib/components/data-table.svelte";
	import type { QueueTaskRow, QueueTaskStreamEvent } from "$lib/queue-tasks";
	import { toast } from "svelte-sonner";

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
		connection = source("/streams/job-queue");
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
</script>

<div class="@container/main flex flex-1 flex-col gap-2">
	<div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
		<SectionCards />
		<div class="px-4 lg:px-6">
			<ChartAreaInteractive />
		</div>
		<DataTable rows={tasks} enableRowDrag={false} enableRowSelect={false} onCancelTask={cancelTask} />
	</div>
</div>
