<script lang="ts">
    import { page } from '$app/state';
    import Button from '$lib/components/ui/button/button.svelte';
    import * as Empty from '$lib/components/ui/empty';
</script>

<svelte:head>
    <title>Error {page.status} | Hesperida</title>
</svelte:head>

<div class="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
	<div class="flex w-full max-w-sm flex-col gap-6">
		<span class="flex items-center gap-2 self-center font-medium">
			Hesperida
        </span>
		<div class="flex flex-col gap-6">
            <Empty.Root>
                <Empty.Header>
                    <Empty.Title class="text-2xl">{page.status} {page.error?.message}</Empty.Title>
                    <Empty.Description>We are sorry we can't complete your request.</Empty.Description>
                </Empty.Header>
                <Empty.Content class="gap-6">
                    <Button href="/" size="lg">Return Home</Button>
                    <Empty.Description>
                        Need help? <a href="https://github.com/rallisf1/hesperida/issues">Contact support</a>
                    </Empty.Description>
                </Empty.Content>
            </Empty.Root>
        </div>
    </div>
</div>

