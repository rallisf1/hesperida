<script lang="ts">
	import { page } from "$app/state";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import type { Component } from "svelte";

	let { items }: { items: { title: string; url: string; icon?: Component }[] } = $props();

	const normalizePath = (path: string): string => {
		if (path === "/") return "/";
		return path.replace(/\/+$/, "");
	};

	const isActiveItem = (itemUrl: string, pathname: string): boolean => {
		const target = normalizePath(itemUrl);
		const current = normalizePath(pathname);
		if (target === "/") return current === "/";
		return current === target || current.startsWith(`${target}/`);
	};
</script>

<Sidebar.Group>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			{#each items as item (item.title)}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton
						tooltipContent={item.title}
						isActive={isActiveItem(item.url, page.url.pathname)}
						class={isActiveItem(item.url, page.url.pathname)
							? "bg-accent text-accent-foreground"
							: ""}
					>
						{#snippet child({ props })}
							<a href={item.url} {...props}>
								{#if item.icon}
									<item.icon />
								{/if}
								<span class="text-sm font-semibold">{item.title}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/each}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
