<script lang="ts">
	import {
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		getSortedRowModel,
		type ColumnDef,
		type PaginationState,
		type RowSelectionState,
		type SortingState,
		type VisibilityState,
	} from "@tanstack/table-core";
	import { createSvelteTable } from "$lib/components/ui/data-table/data-table.svelte.js";
	import { FlexRender, renderComponent } from "$lib/components/ui/data-table/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import Columns3Icon from "@lucide/svelte/icons/columns-3";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ChevronsLeftIcon from "@lucide/svelte/icons/chevrons-left";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ChevronsRightIcon from "@lucide/svelte/icons/chevrons-right";
	import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
	import DataTableActions from "./data-table-actions.svelte";
	import DataTableCheckbox from "./data-table-checkbox.svelte";
	import DataTableStatus from "./data-table-status.svelte";
	import { queueTaskStatuses, type QueueTaskRow } from "$lib/queue-tasks";
  	import { formatDate } from "$lib/utils";

	let {
		rows,
		enableRowDrag = false,
		enableRowSelect = false,
		enableColumnVisibility = true,
		enablePagination = true,
		onCancelTask,
	}: {
		rows: QueueTaskRow[];
		enableRowDrag?: boolean;
		enableRowSelect?: boolean;
		enableColumnVisibility?: boolean;
		enablePagination?: boolean;
		onCancelTask?: (task: QueueTaskRow) => Promise<void> | void;
	} = $props();

	const statusFilters = ["all", ...queueTaskStatuses] as const;
	type StatusFilter = (typeof statusFilters)[number];

	let statusFilter = $state<StatusFilter>("all");
	let sorting = $state<SortingState>([]);
	let rowSelection = $state<RowSelectionState>({});
	let columnVisibility = $state<VisibilityState>({});
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 10 });

	const filteredRows = $derived(
		statusFilter === "all" ? rows : rows.filter((task) => task.status === statusFilter)
	);

	const statusCount = $derived.by(() => {
		const counts: Record<StatusFilter, number> = {
			all: rows.length,
			pending: 0,
			waiting: 0,
			processing: 0,
			completed: 0,
			failed: 0,
			canceled: 0,
		};

		for (const task of rows) {
			counts[task.status] += 1;
		}
		return counts;
	});

	const columns = $derived.by<ColumnDef<QueueTaskRow>[]>(() => {
		const base: ColumnDef<QueueTaskRow>[] = [
			{
				accessorKey: "type",
				header: "Type",
			},
			{
				accessorKey: "website_url",
				header: "Website URL",
			},
			{
				accessorKey: "target",
				header: "Target",
			},
			{
				accessorKey: "status",
				header: "Status",
				cell: ({ row }) => renderComponent(DataTableStatus, { task: row.original }),
			},
			{
				accessorKey: "created_at",
				header: "Created At",
				cell: ({ row }) => formatDate(row.original.created_at, true),
			},
			{
				id: "actions",
				header: () => null,
				enableSorting: false,
				cell: ({ row }) =>
					renderComponent(DataTableActions, {
						task: row.original,
						onCancel: onCancelTask,
					}),
			},
		];

		if (enableRowSelect) {
			base.unshift({
				id: "select",
				header: ({ table }) =>
					renderComponent(DataTableCheckbox, {
						checked: table.getIsAllPageRowsSelected(),
						indeterminate:
							table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
						onCheckedChange: (value) => table.toggleAllPageRowsSelected(!!value),
						"aria-label": "Select all",
					}),
				cell: ({ row }) =>
					renderComponent(DataTableCheckbox, {
						checked: row.getIsSelected(),
						onCheckedChange: (value) => row.toggleSelected(!!value),
						"aria-label": "Select row",
					}),
				enableSorting: false,
				enableHiding: false,
			});
		}

		if (enableRowDrag) {
			base.unshift({
				id: "drag",
				header: () => null,
				enableSorting: false,
				enableHiding: false,
				cell: () => renderComponent(GripVerticalIcon, { class: "size-4 text-muted-foreground" }),
			});
		}

		return base;
	});

	const table = createSvelteTable({
		get data() {
			return filteredRows;
		},
		get columns() {
			return columns;
		},
		state: {
			get sorting() {
				return sorting;
			},
			get rowSelection() {
				return rowSelection;
			},
			get columnVisibility() {
				return columnVisibility;
			},
			get pagination() {
				return pagination;
			},
		},
		getRowId: (row) => row.id,
		get enableRowSelection() {
			return enableRowSelect;
		},
		autoResetPageIndex: false,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onSortingChange: (updater) => {
			sorting = typeof updater === "function" ? updater(sorting) : updater;
		},
		onRowSelectionChange: (updater) => {
			rowSelection = typeof updater === "function" ? updater(rowSelection) : updater;
		},
		onColumnVisibilityChange: (updater) => {
			columnVisibility = typeof updater === "function" ? updater(columnVisibility) : updater;
		},
		onPaginationChange: (updater) => {
			pagination = typeof updater === "function" ? updater(pagination) : updater;
		},
	});

	const onStatusChange = (value: string) => {
		if (statusFilters.includes(value as StatusFilter)) {
			statusFilter = value as StatusFilter;
		}
	};
</script>

<div class="w-full flex-col justify-start gap-6">
	<div class="flex items-center justify-between px-4 mb-4 lg:px-6">
		<Label for="status-selector" class="sr-only">Status</Label>
		<Select.Root type="single" value={statusFilter} onValueChange={onStatusChange}>
			<Select.Trigger class="flex w-fit @4xl/main:hidden" size="sm" id="status-selector">
				{statusFilter === "all" ? "All" : statusFilter}
			</Select.Trigger>
			<Select.Content>
				{#each statusFilters as status (status)}
					<Select.Item value={status}>{status === "all" ? "All" : status}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Tabs.Root value={statusFilter} class="hidden @4xl/main:flex">
			<Tabs.List
				class="**:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1"
			>
				{#each statusFilters as status (status)}
					<Tabs.Trigger value={status} onclick={() => (statusFilter = status)}>
						<span class="capitalize">{status === "all" ? "All" : status}</span>
						<Badge variant="secondary">{statusCount[status]}</Badge>
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>

		{#if enableColumnVisibility}
			<div class="flex items-center gap-2">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" {...props}>
								<Columns3Icon />
								<span class="hidden lg:inline">Customize Columns</span>
								<span class="lg:hidden">Columns</span>
								<ChevronDownIcon />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-56">
						{#each table
							.getAllColumns()
							.filter((col) => typeof col.accessorFn !== "undefined" && col.getCanHide()) as column (column.id)}
							<DropdownMenu.CheckboxItem
								class="capitalize"
								checked={column.getIsVisible()}
								onCheckedChange={(value) => column.toggleVisibility(!!value)}
							>
								{column.id}
							</DropdownMenu.CheckboxItem>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	</div>

	<div class="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
		<div class="overflow-hidden rounded-lg border">
			<Table.Root>
				<Table.Header class="bg-muted sticky top-0 z-10">
					{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
						<Table.Row>
							{#each headerGroup.headers as header (header.id)}
								<Table.Head colspan={header.colSpan}>
									{#if !header.isPlaceholder}
										<FlexRender
											content={header.column.columnDef.header}
											context={header.getContext()}
										/>
									{/if}
								</Table.Head>
							{/each}
						</Table.Row>
					{/each}
				</Table.Header>
				<Table.Body class={enableRowSelect ? "**:data-[slot=table-cell]:first:w-8" : undefined}>
					{#if table.getRowModel().rows?.length}
						{#each table.getRowModel().rows as row (row.id)}
							<Table.Row>
								{#each row.getVisibleCells() as cell (cell.id)}
									<Table.Cell>
										<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
									</Table.Cell>
								{/each}
							</Table.Row>
						{/each}
					{:else}
						<Table.Row>
							<Table.Cell colspan={columns.length} class="h-24 text-center">No tasks yet.</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>

		{#if enablePagination}
			<div class="flex items-center justify-between px-4">
				{#if enableRowSelect}
					<div class="text-muted-foreground hidden flex-1 text-sm lg:flex">
						{table.getFilteredSelectedRowModel().rows.length} of
						{table.getFilteredRowModel().rows.length} row(s) selected.
					</div>
				{:else}
					<div class="text-muted-foreground hidden flex-1 text-sm lg:flex">
						{table.getFilteredRowModel().rows.length} row(s)
					</div>
				{/if}
				<div class="flex w-full items-center gap-8 lg:w-fit">
					<div class="hidden items-center gap-2 lg:flex">
						<Label for="rows-per-page" class="text-sm font-medium">Rows per page</Label>
						<Select.Root
							type="single"
							bind:value={
								() => `${table.getState().pagination.pageSize}`,
								(v) => table.setPageSize(Number(v))
							}
						>
							<Select.Trigger size="sm" class="w-20" id="rows-per-page">
								{table.getState().pagination.pageSize}
							</Select.Trigger>
							<Select.Content side="top">
								{#each [10, 20, 30, 40, 50] as pageSize (pageSize)}
									<Select.Item value={pageSize.toString()}>{pageSize}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<div class="flex w-fit items-center justify-center text-sm font-medium">
						Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
					</div>

					<div class="ms-auto flex items-center gap-2 lg:ms-0">
						<Button
							variant="outline"
							class="hidden size-8 p-0 lg:flex"
							onclick={() => table.setPageIndex(0)}
							disabled={!table.getCanPreviousPage()}
						>
							<span class="sr-only">Go to first page</span>
							<ChevronsLeftIcon />
						</Button>
						<Button
							variant="outline"
							class="size-8 p-0"
							onclick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							<span class="sr-only">Go to previous page</span>
							<ChevronLeftIcon />
						</Button>
						<Button
							variant="outline"
							class="size-8 p-0"
							onclick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							<span class="sr-only">Go to next page</span>
							<ChevronRightIcon />
						</Button>
						<Button
							variant="outline"
							class="hidden size-8 p-0 lg:flex"
							onclick={() => table.setPageIndex(table.getPageCount() - 1)}
							disabled={!table.getCanNextPage()}
						>
							<span class="sr-only">Go to last page</span>
							<ChevronsRightIcon />
						</Button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
