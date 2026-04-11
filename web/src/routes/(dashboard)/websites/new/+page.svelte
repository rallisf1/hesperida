<script lang="ts">
	let { form } = $props();
</script>

<div class="p-4 lg:p-6 max-w-xl space-y-4">
	<h2 class="text-xl font-semibold">Create Website</h2>

	{#if form?.error}
		<p class="text-sm text-destructive">{form.error}</p>
	{/if}

	<form method="POST" class="space-y-3">
		<div class="space-y-1">
			<label for="url" class="text-sm">URL</label>
			<input id="url" name="url" class="w-full border rounded-md p-2" value={form?.values?.url ?? ''} />
		</div>
		<div class="space-y-1">
			<label for="description" class="text-sm">Description</label>
			<input id="description" name="description" class="w-full border rounded-md p-2" value={form?.values?.description ?? ''} />
		</div>
		<div class="flex items-center gap-3">
			<button type="submit" class="border rounded-md px-3 py-2">Create</button>
			<a href="/websites" class="underline text-sm">Cancel</a>
		</div>
	</form>
</div>

