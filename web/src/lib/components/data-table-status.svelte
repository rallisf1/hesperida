<script lang="ts">
	import { Badge } from "$lib/components/ui/badge/index.js";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
	import MinusCircleIcon from "@lucide/svelte/icons/minus-circle";
	import type { QueueTaskRow } from "$lib/queue-tasks";

	let { task }: { task: QueueTaskRow } = $props();
</script>

<Badge variant="outline" class="text-muted-foreground px-1.5">
	{#if task.status === "completed"}
		<CircleCheckIcon class="text-green-500 dark:text-green-400" />
	{:else if task.status === "failed"}
		<AlertTriangleIcon class="text-red-500 dark:text-red-400" />
	{:else if task.status === "canceled"}
		<MinusCircleIcon class="text-orange-500 dark:text-orange-400" />
	{:else}
		<LoaderCircleIcon />
	{/if}
	{task.status}
</Badge>
