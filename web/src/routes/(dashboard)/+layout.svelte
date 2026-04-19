<script lang="ts">
	import HouseIcon from "@lucide/svelte/icons/house";
	import UsersIcon from "@lucide/svelte/icons/users";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import BriefcaseBusinessIcon from "@lucide/svelte/icons/briefcase-business";
	import ListTodoIcon from "@lucide/svelte/icons/list-todo";
	import FileCodeIcon from "@lucide/svelte/icons/file-code";
	import FileQuestionMarkIcon from "@lucide/svelte/icons/file-question-mark";
	import GithubStar from "$lib/components/ui/button/github-star.svelte";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { onDestroy, onMount } from "svelte";
	import { source } from "sveltekit-sse";
	import { toast } from "svelte-sonner";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import NavMain from "$lib/components/nav-main.svelte";
	import NavUser from "$lib/components/nav-user.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  	import NavSecondary from "$lib/components/nav-secondary.svelte";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { toggleMode, mode } from "mode-watcher";
	import type { DashboardNotificationEvent } from "$lib/notifications";
  	import { asset } from "$app/paths";

	let { data, children } = $props();

	let darkMode = $state(mode.current === "dark");
	let notificationsConnection: ReturnType<typeof source> | null = null;
	let notificationsUnsubscribe: (() => void) | null = null;
	const seenNotificationEvents = new Set<string>();

	export const navMain = [
		{ title: "Home", url: "/", icon: HouseIcon },
		{ title: "Users", url: "/users", icon: UsersIcon, adminOnly: true },
		{ title: "Websites", url: "/websites", icon: GlobeIcon },
		{ title: "Jobs", url: "/jobs", icon: BriefcaseBusinessIcon },
		{ title: "Job Queue", url: "/job-queue", icon: ListTodoIcon }
	];

	const navSecondary = [
		{ title: "API", url: "/api", icon: FileCodeIcon },
		{ title: "Docs", url: "https://rallisf1.github.io/hesperida", icon: FileQuestionMarkIcon }
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

	const toggleDarkMode = () => {
		darkMode = !darkMode;
		toggleMode();
	};

	const staticSegmentLabels: Record<string, string> = {
		users: "Users",
		websites: "Websites",
		jobs: "Jobs",
		"job-queue": "Job Queue",
		new: "New",
		edit: "Edit"
	};

	const toTitleCase = (value: string): string =>
		value
			.replace(/[-_]+/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.split(" ")
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(" ");

	const shortenId = (value: string): string => {
		if (value.length <= 12) return value;
		return `${value.slice(0, 6)}...${value.slice(-4)}`;
	};

	const breadcrumbs = $derived.by(() => {
		const pathname = page.url.pathname;
		const pathSegments = pathname.split("/").filter(Boolean);
		const routeSegments = (page.route.id ?? "")
			.split("/")
			.filter((segment) => segment.length > 0 && !segment.startsWith("("));

		const entityLabel = page.data?.breadcrumbEntityLabel;
		const entityHref = page.data?.breadcrumbEntityHref;
		let entityApplied = false;
		let currentPath = "";

		const items = [{ label: "Home", href: "/", current: pathSegments.length === 0 }];

		for (let i = 0; i < pathSegments.length; i += 1) {
			const segment = pathSegments[i]!;
			currentPath += `/${segment}`;

			const routeSegment = routeSegments[i] ?? "";
			const isDynamicSegment =
				routeSegment.startsWith("[") && routeSegment.endsWith("]");

			let label: string;
			let href = currentPath;
			if (isDynamicSegment && !entityApplied) {
				label =
					typeof entityLabel === "string" && entityLabel.trim().length > 0
						? entityLabel
						: shortenId(segment);
				if (typeof entityHref === "string" && entityHref.trim().length > 0) {
					href = entityHref;
				}
				entityApplied = true;
			} else {
				label = staticSegmentLabels[segment] ?? toTitleCase(segment);
			}

			items.push({
				label,
				href,
				current: i === pathSegments.length - 1
			});
		}

		return items;
	});

	onMount(() => {
		notificationsConnection = source("/streams/notifications");
		const stream = notificationsConnection
			.select("notifications")
			.json<DashboardNotificationEvent>();
		notificationsUnsubscribe = stream.subscribe((event) => {
			if (!event?.event_id) return;
			if (seenNotificationEvents.has(event.event_id)) return;
			seenNotificationEvents.add(event.event_id);

			const action = event.href
				? {
					label: "View",
					onClick: () => void goto(event.href)
				}
				: undefined;

			if (event.status === "failed") {
				toast.error(event.message, { action });
				return;
			}
			toast.success(event.message, { action });
		});
	});

	onDestroy(() => {
		notificationsUnsubscribe?.();
		notificationsConnection?.close();
	});
</script>

<Sidebar.Provider
	style="--sidebar-width: calc(var(--spacing) * 52); --header-height: calc(var(--spacing) * 12);"
>
	<Sidebar.Root collapsible="offcanvas" variant="inset">
		<Sidebar.Header>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton class="data-[slot=sidebar-menu-button]:p-1.5!">
						{#snippet child({ props })}
							<a href="/" {...props}>
								<img src={asset('/hesperida-icon.svg')} class="max-h-5 w-auto" alt="Hesperida Web Scanner" />
								<span class="text-base font-semibold">Hesperida <span class="text-xs">v{data.version}</span></span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>
			<Sidebar.Content>
				<NavMain items={navMain} currentUserRole={data.user.role ?? 'viewer'} />
				<NavSecondary items={navSecondary} class="mt-auto" />
			</Sidebar.Content>
		<Sidebar.Footer>
			<div class="flex items-center space-x-2 p-2">
				{#key darkMode}
				<Switch id="dark-mode" onclick={toggleDarkMode} checked={darkMode} />
				{/key}
				<Label for="dark-mode">Dark Mode</Label>
			</div>
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
				<Breadcrumb.Root>
					<Breadcrumb.List>
						{#each breadcrumbs as crumb, index (crumb.href + crumb.label)}
							<Breadcrumb.Item>
								{#if crumb.current}
									<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
								{:else}
									<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
								{/if}
							</Breadcrumb.Item>
							{#if index < breadcrumbs.length - 1}
								<Breadcrumb.Separator />
							{/if}
						{/each}
					</Breadcrumb.List>
				</Breadcrumb.Root>
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
