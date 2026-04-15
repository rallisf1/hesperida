<script lang="ts">
	import JobQueueDiffView from '$lib/components/job-queue-diff-view.svelte';
	let { data, form } = $props();
</script>

<JobQueueDiffView {data} {form} />
