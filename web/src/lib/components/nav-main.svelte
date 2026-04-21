<script lang="ts">
	import { page } from "$app/state";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  	import type { User } from "$lib/types";
	import type { Component } from "svelte";

	type NavMainItem = {
		title: string;
		url: string;
		icon?: Component;
		adminOnly?: boolean;
		children?: Array<{
			title: string;
			url: string;
		}>;
	};

	let { items, currentUserRole }: { items: NavMainItem[]; currentUserRole: User["role"] } = $props();
	let expandedParents = $state<Record<string, boolean>>({});

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

	const isParentActive = (item: NavMainItem, pathname: string): boolean =>
		isActiveItem(item.url, pathname) ||
		Boolean(item.children?.some((child) => isActiveItem(child.url, pathname)));

	const isParentExpanded = (item: NavMainItem, pathname: string): boolean =>
		isParentActive(item, pathname) || Boolean(expandedParents[item.title]);

	const toggleParent = (item: NavMainItem) => {
		expandedParents = {
			...expandedParents,
			[item.title]: !Boolean(expandedParents[item.title])
		};
	};
</script>

<Sidebar.Group>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			{#each items as item (item.title)}
			{#if !item.adminOnly || (item.adminOnly && currentUserRole === 'admin')}
				<Sidebar.MenuItem>
					{#if item.children?.length}
						<Sidebar.MenuButton
							tooltipContent={item.title}
							isActive={isParentActive(item, page.url.pathname)}
							aria-expanded={isParentExpanded(item, page.url.pathname)}
							onclick={() => toggleParent(item)}
							class={isParentActive(item, page.url.pathname)
								? "bg-accent text-accent-foreground"
								: ""}
						>
							{#if item.icon}
								<item.icon />
							{/if}
							<span class="text-sm font-semibold">{item.title}</span>
							<ChevronDownIcon
								class={`ml-auto size-4 transition-transform ${
									isParentExpanded(item, page.url.pathname) ? "rotate-180" : ""
								}`}
							/>
						</Sidebar.MenuButton>
						{#if isParentExpanded(item, page.url.pathname)}
							<Sidebar.MenuSub>
								{#each item.children as subItem (subItem.title)}
									<Sidebar.MenuSubItem>
										<Sidebar.MenuSubButton
											isActive={isActiveItem(subItem.url, page.url.pathname)}
											class={isActiveItem(subItem.url, page.url.pathname)
												? "bg-accent text-accent-foreground"
												: ""}
										>
											{#snippet child({ props })}
												<a href={subItem.url} {...props}>
													<span>{subItem.title}</span>
												</a>
											{/snippet}
										</Sidebar.MenuSubButton>
									</Sidebar.MenuSubItem>
								{/each}
							</Sidebar.MenuSub>
						{/if}
					{:else}
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
					{/if}
				</Sidebar.MenuItem>
			{/if}
			{/each}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
