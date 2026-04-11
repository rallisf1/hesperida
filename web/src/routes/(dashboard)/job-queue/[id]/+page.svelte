<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data, form } = $props();
</script>

<div class="p-4 lg:p-6 max-w-3xl space-y-4">
	<h2 class="text-xl font-semibold">Queue Task Details</h2>
	<pre class="rounded-md border p-4 overflow-auto text-sm">{JSON.stringify(data.task, null, 2)}</pre>

	{#if form?.cancel_error}
		<p class="text-sm text-destructive">{form.cancel_error}</p>
	{/if}

	<div class="flex items-center gap-3">
		{#if (data.task as { status?: string }).status === 'waiting'}
			<form method="POST" action="?/cancel">
				<Button type="submit" variant="destructive">Cancel Task</Button>
			</form>
		{/if}
		<a href="/job-queue">
			<Button variant="outline">
				<ArrowLeftIcon class="size-4" />
				Back to list
			</Button>
		</a>
	</div>
</div>
