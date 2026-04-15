<script lang="ts">
    import { FieldDescription } from "$lib/components/ui/field";
    import GalleryVerticalEndIcon from "@lucide/svelte/icons/gallery-vertical-end";
	import SunIcon from "@lucide/svelte/icons/sun";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import { toggleMode } from "mode-watcher";
	import { Button } from "$lib/components/ui/button/index.js";
  	import { asset } from "$app/paths";

    let { children } = $props();
</script>

<div class="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
	<div class="flex w-full max-w-sm flex-col gap-6">
		<a href="/auth/signin" class="flex flex-col items-center gap-2 self-center font-medium">
			<img src={asset('/hesperida-logo.svg')} alt="Hesperida Web Scanner" class="max-w-64 max-h-42 w-auto h-auto" />
		</a>
		<div class="flex flex-col gap-6">
            {@render children()}

           	<FieldDescription class="px-6 text-center">
                Powered by <a href="https://github.com/rallisf1/hesperida" target="_blank">Hesperida</a>.
            </FieldDescription>
        </div>
    </div>
</div>

<div class="fixed bottom-4 right-4 lg:bottom-8 lg:right-8">
	<Button onclick={toggleMode} variant="outline" size="lg">
		<SunIcon class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all! dark:scale-0 dark:-rotate-90" />
		<MoonIcon class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0" />
		<span class="sr-only">Toggle theme</span>
	</Button>
</div>