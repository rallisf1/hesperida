<script lang="ts">
	import HouseIcon from "@lucide/svelte/icons/house";
	import UsersIcon from "@lucide/svelte/icons/users";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import BriefcaseBusinessIcon from "@lucide/svelte/icons/briefcase-business";
	import ListTodoIcon from "@lucide/svelte/icons/list-todo";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import { GithubStar } from "$lib/components/ui/button/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import NavMain from "$lib/components/nav-main.svelte";
	import NavUser from "$lib/components/nav-user.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let { data, children } = $props();

	const navMain = [
		{ title: "Home", url: "/", icon: HouseIcon },
		{ title: "Users", url: "/users", icon: UsersIcon },
		{ title: "Websites", url: "/websites", icon: GlobeIcon },
		{ title: "Jobs", url: "/jobs", icon: BriefcaseBusinessIcon },
		{ title: "Tasks", url: "/job-queue", icon: ListTodoIcon },
		{ title: "Reports", url: "/reports", icon: FileTextIcon }
	];

	const toInitials = (name: string | null | undefined, email: string | null | undefined): string => {
		const source = (name?.trim() || email?.trim() || "").replace(/\s+/g, " ").trim();
		if (!source) return "U";
		const parts = source.split(" ").filter(Boolean);
		if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
		return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
	};

	const user = $derived({
		name: data?.user?.name ?? "User",
		email: data?.user?.email ?? "",
		initials: toInitials(data?.user?.name, data?.user?.email)
	});
</script>

<Sidebar.Provider
	style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
>
	<Sidebar.Root collapsible="offcanvas" variant="inset">
		<Sidebar.Header>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton class="data-[slot=sidebar-menu-button]:p-1.5!">
						{#snippet child({ props })}
							<a href="/" {...props}>
								<SparklesIcon class="size-5!" />
								<span class="text-base font-semibold">Hesperida</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>
		<Sidebar.Content>
			<NavMain items={navMain} />
		</Sidebar.Content>
		<Sidebar.Footer>
			<NavUser {user} />
		</Sidebar.Footer>
	</Sidebar.Root>
	<Sidebar.Inset>
		<header
			class="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)"
		>
			<div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<Sidebar.Trigger class="-ms-1" />
				<Separator orientation="vertical" class="mx-2 data-[orientation=vertical]:h-4" />
				<h1 class="text-base font-medium">Dashboard</h1>
				<div class="ms-auto flex items-center gap-2">
					<GithubStar repo="rallisf1/hesperida" />
				</div>
			</div>
		</header>
		<div class="flex flex-1 flex-col">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
