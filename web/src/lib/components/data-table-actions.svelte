<script lang="ts">
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import EllipsisVerticalIcon from "@lucide/svelte/icons/ellipsis-vertical";
	import type { QueueTaskRow } from "$lib/queue-tasks";

	let {
		task,
		onCancel,
	}: {
		task: QueueTaskRow;
		onCancel?: (task: QueueTaskRow) => void | Promise<void>;
	} = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="data-[state=open]:bg-muted text-muted-foreground flex size-8">
		{#snippet child({ props })}
			<Button variant="ghost" size="icon" {...props}>
				<EllipsisVerticalIcon />
				<span class="sr-only">Open menu</span>
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-40">
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a href={`/results/${task.job_id}`} {...props}>View Results</a>
			{/snippet}
		</DropdownMenu.Item>
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a href={`/jobs/${task.job_id}`} {...props}>View Job</a>
			{/snippet}
		</DropdownMenu.Item>
		{#if task.status === "waiting"}
			<DropdownMenu.Separator />
			<DropdownMenu.Item
				variant="destructive"
				onclick={() => {
					void onCancel?.(task);
				}}
			>
				Cancel
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
