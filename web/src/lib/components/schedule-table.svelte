<script lang="ts">
	import { getNextUtcRunIso } from '$lib/cron';
	import type { ScheduleView } from '$lib/types/view';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/utils';

	let {
		schedules,
		emptyMessage = 'No schedules found.',
		showLinked = true,
		showView = true
	}: {
		schedules: ScheduleView[];
		emptyMessage?: string;
		showLinked?: boolean;
		showView?: boolean;
	} = $props();

	const statusBadgeVariant = (status?: string) => {
		switch (status) {
			case 'completed':
				return 'secondary';
			case 'failed':
				return 'destructive';
			case 'processing':
				return 'default';
			case 'pending':
			default:
				return 'outline';
		}
	};

	const formatNextRunUtc = (cron: string): string => {
		const next = getNextUtcRunIso(cron);
		if (!next) return 'Invalid cron';

		const date = new Date(next);
		if (Number.isNaN(date.getTime())) return 'Invalid cron';

		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'UTC'
		}).format(date);
	};
</script>

<div class="overflow-auto rounded-md border">
	<Table.Root class="w-full text-sm">
		<Table.Header class="bg-muted/50">
			<Table.Row>
				{#if showLinked}
					<Table.Head class="text-left p-3">Website</Table.Head>
					<Table.Head class="text-left p-3">Job</Table.Head>
				{/if}
				<Table.Head class="text-left p-3">Cron (UTC)</Table.Head>
				<Table.Head class="text-left p-3">Enabled</Table.Head>
				<Table.Head class="text-left p-3">Next Run (UTC)</Table.Head>
				<Table.Head class="text-left p-3">Runs</Table.Head>
				{#if showView}
					<Table.Head class="text-left p-3">Actions</Table.Head>
				{/if}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#if schedules.length === 0}
				<Table.Row>
					<Table.Cell colspan={showLinked ? (showView ? 7 : 6) : (showView ? 5 : 4)} class="p-3 text-muted-foreground">
						{emptyMessage}
					</Table.Cell>
				</Table.Row>
			{:else}
				{#each schedules as schedule (schedule.id)}
					<Table.Row class="border-t">
						{#if showLinked}
							<Table.Cell class="p-3">{schedule.website_url || '-'}</Table.Cell>
							<Table.Cell class="p-3 font-mono text-xs">{schedule.job_id || '-'}</Table.Cell>
						{/if}
						<Table.Cell class="p-3 font-mono text-xs">{schedule.cron}</Table.Cell>
						<Table.Cell class="p-3">
							<Badge variant={schedule.enabled ? 'default' : 'outline'}>
								{schedule.enabled ? 'Yes' : 'No'}
							</Badge>
						</Table.Cell>
						<Table.Cell class="p-3">{formatNextRunUtc(schedule.cron)}</Table.Cell>
						<Table.Cell class="p-3">
							<Dialog.Root>
								<Dialog.Trigger>
									{#snippet child({ props })}
										<Button variant="outline" size="sm" {...props}>
											{Number(schedule.runs_count ?? schedule.created.length ?? 0)}
										</Button>
									{/snippet}
								</Dialog.Trigger>
								<Dialog.Content class="max-w-4xl">
									<Dialog.Header>
										<Dialog.Title>Schedule Runs</Dialog.Title>
										<Dialog.Description>
											Created jobs for schedule <span class="font-mono">{schedule.id}</span>
										</Dialog.Description>
									</Dialog.Header>

									<div class="overflow-auto rounded-md border">
										<Table.Root class="w-full text-sm">
											<Table.Header class="bg-muted/50">
												<Table.Row>
													<Table.Head class="text-left p-3">Website URL</Table.Head>
													<Table.Head class="text-left p-3">Tools</Table.Head>
													<Table.Head class="text-left p-3">Status</Table.Head>
													<Table.Head class="text-left p-3">Created</Table.Head>
													<Table.Head class="text-left p-3">Actions</Table.Head>
												</Table.Row>
											</Table.Header>
											<Table.Body>
												{#if (schedule.created_jobs ?? []).length === 0}
													<Table.Row>
														<Table.Cell colspan={5} class="p-3 text-muted-foreground">
															No runs available.
														</Table.Cell>
													</Table.Row>
												{:else}
													{#each schedule.created_jobs as job (job.id)}
														<Table.Row class="border-t">
															<Table.Cell class="p-3">{job.website_url || '-'}</Table.Cell>
															<Table.Cell class="p-3">
																<div class="flex flex-wrap gap-1">
																	{#if (job.types ?? []).length === 0}
																		<span>-</span>
																	{:else}
																		{#each job.types ?? [] as tool (tool)}
																			<Badge variant="outline">{tool}</Badge>
																		{/each}
																	{/if}
																</div>
															</Table.Cell>
															<Table.Cell class="p-3">
																<Badge variant={statusBadgeVariant(job.status)}>{job.status ?? 'pending'}</Badge>
															</Table.Cell>
															<Table.Cell class="p-3">{formatDate(job.created_at, true)}</Table.Cell>
															<Table.Cell class="p-3">
																<Button href={`/jobs/${job.id}`} variant="outline" size="sm">View</Button>
															</Table.Cell>
														</Table.Row>
													{/each}
												{/if}
											</Table.Body>
										</Table.Root>
									</div>
								</Dialog.Content>
							</Dialog.Root>
						</Table.Cell>
						{#if showView}
							<Table.Cell class="p-3">
								<Button href={`/schedule/${schedule.id}`} variant="outline" size="sm">View</Button>
							</Table.Cell>
						{/if}
					</Table.Row>
				{/each}
			{/if}
		</Table.Body>
	</Table.Root>
</div>
