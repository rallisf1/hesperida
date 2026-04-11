<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();
	const pretty = (value: unknown): string => {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	};
</script>

<div class="p-4 lg:p-6 max-w-3xl space-y-4">
	<h2 class="text-xl font-semibold">Job Details</h2>
	<pre class="rounded-md border p-4 overflow-auto text-sm">{pretty(data.job)}</pre>
	<div class="flex items-center gap-3">
		<a href={`/jobs/${data.job.id}/edit`}>
			<Button>
				<PencilIcon class="size-4" />
				Edit
			</Button>
		</a>
		<a href="/jobs">
			<Button variant="outline">
				<ArrowLeftIcon class="size-4" />
				Back to list
			</Button>
		</a>
	</div>
</div>
