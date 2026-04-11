<script lang="ts">
	let { data, form } = $props();
</script>

<div class="p-4 lg:p-6 max-w-2xl space-y-4">
	<h2 class="text-xl font-semibold">Create Job</h2>

	{#if form?.error}
		<p class="text-sm text-destructive">{form.error}</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div class="space-y-1">
			<label for="website" class="text-sm">Website</label>
			<select id="website" name="website" class="w-full border rounded-md p-2">
				<option value="">Select a website...</option>
				{#each data.websites as website (website.id)}
					<option value={website.id}>{website.url}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-2">
			<p class="text-sm">Tools</p>
			<div class="grid grid-cols-2 gap-2">
				{#each data.tools as tool (tool)}
					<label class="inline-flex items-center gap-2 text-sm">
						<input type="checkbox" name="types" value={tool} />
						<span>{tool}</span>
					</label>
				{/each}
			</div>
		</div>

		<div class="space-y-1">
			<label for="options" class="text-sm">Options (JSON object, optional)</label>
			<input id="options" name="options" class="w-full border rounded-md p-2" placeholder="JSON object (example: key-value pairs)" />
		</div>

		<div class="flex items-center gap-3">
			<button type="submit" class="border rounded-md px-3 py-2">Create</button>
			<a href="/jobs" class="underline text-sm">Cancel</a>
		</div>
	</form>
</div>
