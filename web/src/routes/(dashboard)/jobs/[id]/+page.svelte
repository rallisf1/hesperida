<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from "$lib/components/ui/table/index.js";
	import { formatDate } from '$lib/utils.js';
	import ScoreChart, {type ScoreChartItem} from '$lib/components/chart-radial-score.svelte'
	import type { Tool } from '$lib/types';
	import type {
		ApiCommonScoreResult,
		ApiDomainResult,
		ApiJobResults,
		ApiProbeResult,
		ApiSSLResult,
		ApiSecurityResult,
		ApiSeoResult,
		ApiStressResult,
		ApiWcagResult,
		ApiWhoisResult,
		ApiWebsite
	} from '$lib/types/api';
	import ThumbsDownIcon from "@lucide/svelte/icons/thumbs-down";
	import ThumbsUpIcon from "@lucide/svelte/icons/thumbs-up";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import Icon from '@iconify/svelte';
	import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Item from "$lib/components/ui/item/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  	import { type Technology } from '$lib/server/wappalyzer';
	import Globe from '$lib/components/globe.svelte';
	import DnsRecords from '$lib/components/dns-records.svelte';
  	import ScoreToolResults from '$lib/components/score-tool-results.svelte';

	let { data } = $props();
	type JobViewModel = ApiJobResults & {
		geo: {
			lat: number;
			lon: number;
			countryName: string;
			countryCode: string;
			zip: string;
			city: string;
		};
		probe: ApiProbeResult & {
			tech?: Technology[];
			wp_plugins?: Technology[];
			wp_themes?: Technology[];
		};
	};
	const job = $derived(data.job as JobViewModel);
	const website = $derived(
		typeof job.website === 'string' ? ({ url: '' } as ApiWebsite) : job.website
	);
	const types = $derived((Array.isArray(job.types) ? job.types : []) as Tool[]);

	let wcagArray = $derived(job.wcag ? (job.wcag as ApiWcagResult[]).map(wcag => {
		return {
			id: String(wcag.id ?? '').split(':').pop() ?? '',
			name: wcag.device,
			slug: wcag.device.replace(/[\s-'\./]/, '_').toLowerCase(),
			score: wcag.score
		} as { id: string; name: string; slug: string; score: number; }
	}) : []);

	const chartScores = $derived.by(() => {
		const results: ScoreChartItem[] = [];
		if(job.stress) {
			results.push({
				tool: 'stress',
				label: 'Stress',
				score: (job.stress as ApiStressResult).score
			});
		}
		if(job.wcag && (job.wcag as ApiWcagResult[]).length) {
			wcagArray.forEach((item, i) => {
				results.push({
					tool: `wcag_${item.slug}`,
					label: `WCAG (${item.name})`,
					index: i,
					score: item.score
				});
			});
		}
		if(job.seo) {
			results.push({
				tool: 'seo',
				label: 'SEO',
				score: (job.seo as ApiSeoResult).score
			});
		}
		if(job.security) {
			results.push({
				tool: 'security',
				label: 'Security',
				score: (job.security as ApiSecurityResult).score
			});
		}
		return results;
	});

	const getScoreResult = (scoreRow: ScoreChartItem): ApiCommonScoreResult | ApiWcagResult | null => {
		if (scoreRow.tool.startsWith('wcag')) {
			return (job.wcag as ApiWcagResult[])[scoreRow.index as number] ?? null;
		}
		if (scoreRow.tool === 'seo') return (job.seo as ApiSeoResult) ?? null;
		if (scoreRow.tool === 'security') return (job.security as ApiSecurityResult) ?? null;
		if (scoreRow.tool === 'stress') return (job.stress as ApiStressResult) ?? null;
		return null;
	};

	const seoDescription = $derived.by(() => {
		if (!job.seo) return '';
		const raw = (job.seo as ApiSeoResult).raw as {
			categoryResults?: Array<{
				results?: Array<{
					ruleId?: string;
					details?: { description?: string };
				}>;
			}>;
		};
		const results = raw.categoryResults?.[0]?.results ?? [];
		const description = results.find((rule) => rule.ruleId === 'core-description-present')?.details
			?.description;
		return description ? String(description) : '';
	});

	const statusBadgeVariant = (status?: string) => {
		switch (status) {
			case 'completed':
				return 'default';
			case 'failed':
				return 'destructive';
			case 'processing':
				return 'outline';
			case 'pending':
			default:
				return 'outline';
		}
	};

	const isCompleted = $derived(String(job.status ?? '').toLowerCase() === 'completed');
	let isPdfDownloading = $state(false);
	let pdfDownloadError = $state('');

	const pickFilename = (contentDisposition: string | null, fallback: string): string => {
		if (!contentDisposition) return fallback;
		const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
		if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
		const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
		return basicMatch?.[1] ?? fallback;
	};

	const downloadPdfEnhance = ({
		action,
		cancel
	}: {
		action: URL;
		cancel: () => void;
	}) => {
		cancel();

		void (async () => {
			if (isPdfDownloading || !isCompleted) return;

			isPdfDownloading = true;
			pdfDownloadError = '';

			try {
				const response = await fetch(action, {
					method: 'POST',
					credentials: 'same-origin'
				});

				if (!response.ok) {
					let message = 'Failed to generate PDF report.';
					try {
						const payload = (await response.json()) as {
							error?: { message?: string };
						};
						message = payload?.error?.message || message;
					} catch {
						// keep fallback message
					}
					pdfDownloadError = message;
					return;
				}

				const blob = await response.blob();
				const objectUrl = URL.createObjectURL(blob);
				const fileName = pickFilename(
					response.headers.get('content-disposition'),
					`hesperida-job-${String(job.id ?? '')}.pdf`
				);

				const link = document.createElement('a');
				link.href = objectUrl;
				link.download = fileName;
				link.style.display = 'none';
				document.body.appendChild(link);
				link.click();
				link.remove();
				URL.revokeObjectURL(objectUrl);
			} catch {
				pdfDownloadError = 'Unable to download PDF report right now.';
			} finally {
				isPdfDownloading = false;
			}
		})();
	};
</script>

<div class="p-4 lg:p-6 space-y-4">
	<h2 class="text-xl font-semibold">Job Details</h2>
	<div class="grid grid-flow-row-dense grid-flow-col-dense gap-4" style="grid-template-columns: repeat(6, minmax(10vw, 1fr));">
		<Card.Root class="row-span-2 col-span-6 lg:col-span-3">
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<span>Status:</span>
					<Badge variant={statusBadgeVariant(job.status as string)}>{String(job.status ?? 'pending')}</Badge>
				</Card.Title>
				<Card.Description>
					URL: <Button variant='link' href={website.url} target="_blank" title="Visit Website">{website.url}</Button> · Scanned: {formatDate(String(job.created_at ?? ''), true)}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				<div class="flex flex-wrap gap-1">
					Tools: 
					{#if types.length === 0}
						<span class="text-sm text-muted-foreground">No tools.</span>
					{:else}
						{#each types as tool (tool)}
						{#if tool !== 'probe'}
							<Badge variant="outline">{tool}</Badge>
						{/if}
						{/each}
					{/if}
				</div>
				{@const probe = job.probe}
				<Item.Root>
					<Item.Content class="block">
						{#if probe.favicon?.length}
							<img src="data:image/png;base64,{probe.favicon}" width="64" height="64" class="float-left mr-2" alt="favicon" />
						{/if}
						<Item.Title>{probe.title}</Item.Title>
						{#if seoDescription}
						<Item.Description>{seoDescription}</Item.Description>
						{/if}
					</Item.Content>
				</Item.Root>
				{#if probe.cdn && probe.cdn.name}
				<Item.Root>
					<Item.Content>
						<Item.Title>CDN</Item.Title>
						<Item.Description class="capitalize">
							{probe.cdn.name}
						</Item.Description>
					</Item.Content>
					<Item.Action>
						<Badge>{probe.cdn.type.toUpperCase()}</Badge>
					</Item.Action>
				</Item.Root>
				{/if}
				<Item.Root>
					<Item.Content>
						<Item.Title>Response</Item.Title>
						<Item.Description>
							{parseFloat(probe.response_time).toFixed(2)} ms
						</Item.Description>
					</Item.Content>
					{#if probe.server !== 'null'}
					<Item.Action>
						<Badge class="capitalize">{probe.server}</Badge>
					</Item.Action>
					{/if}
				</Item.Root>
				{#if probe.tech && probe.tech.length}
				<Item.Root>
					<Item.Content>
						<Item.Title>Tech detected</Item.Title>
						<Item.Description class="flex gap-2 pt-1 flex-wrap">						
						{#each probe.tech as techItem}
							{@const tech = techItem as unknown as Technology}
							<Tooltip.Provider>
								<Tooltip.Root>
									<Tooltip.Trigger class={buttonVariants({ variant: "outline" })}
									>
									{#if tech.website?.length}
									<a href={tech.website} target="_blank" class="flex gap-1 items center">
										{#if tech.icon}
										<img src="/wappalyzer/{tech.icon}" width="16" height="16" class="object-contain" alt={tech.name} />
										{/if}
										{tech.name}
									</a>
									{:else}
									<div class="flex gap-1 items center">
										{#if tech.icon}
										<img src="/wappalyzer/{tech.icon}" width="16" height="16" class="object-contain" alt={tech.name} />
										{/if}
										{tech.name}
									</div>
									{/if}
									</Tooltip.Trigger>
									<Tooltip.Content>{tech.description}</Tooltip.Content>
								</Tooltip.Root>
							</Tooltip.Provider>
						{/each}
						</Item.Description>
					</Item.Content>
				</Item.Root>
				{/if}
				{#if probe.wp_plugins && probe.wp_plugins.length}
				<Item.Root>
					<Item.Content>
						<Item.Title>WP Plugins detected</Item.Title>
						<Item.Description class="flex gap-2 pt-1 flex-wrap">						
						{#each probe.wp_plugins as techItem}
						{@const tech = techItem as unknown as Technology}
							<Tooltip.Provider>
								<Tooltip.Root>
									<Tooltip.Trigger class={buttonVariants({ variant: "outline" })}
									>
									{#if tech.website?.length}
									<a href={tech.website} target="_blank" class="flex gap-1 items center">
										{#if tech.icon}
										<img src="/wappalyzer/{tech.icon}" width="16" height="16" class="object-contain" alt={tech.name} />
										{/if}
										{tech.name}
									</a>
									{:else}
									<div class="flex gap-1 items center">
										{#if tech.icon}
										<img src="/wappalyzer/{tech.icon}" width="16" height="16" class="object-contain" alt={tech.name} />
										{/if}
										{tech.name}
									</div>
									{/if}
									</Tooltip.Trigger>
									<Tooltip.Content>{tech.description}</Tooltip.Content>
								</Tooltip.Root>
							</Tooltip.Provider>
						{/each}
						</Item.Description>
					</Item.Content>
				</Item.Root>
				{/if}
				{#if probe.wp_themes && probe.wp_themes.length}
				<Item.Root>
					<Item.Content>
						<Item.Title>WP Themes detected</Item.Title>
						<Item.Description class="flex gap-2 pt-1 flex-wrap">						
						{#each probe.wp_themes as techItem}
						{@const tech = techItem as unknown as Technology}
							<Tooltip.Provider>
								<Tooltip.Root>
									<Tooltip.Trigger class={buttonVariants({ variant: "outline" })}
									>
									{#if tech.website?.length}
									<a href={tech.website} target="_blank" class="flex gap-1 items center">
										{#if tech.icon}
										<img src="/wappalyzer/{tech.icon}" width="16" height="16" class="object-contain" alt={tech.name} />
										{/if}
										{tech.name}
									</a>
									{:else}
									<div class="flex gap-1 items center">
										{#if tech.icon}
										<img src="/wappalyzer/{tech.icon}" width="16" height="16" class="object-contain" alt={tech.name} />
										{/if}
										{tech.name}
									</div>
									{/if}
									</Tooltip.Trigger>
									<Tooltip.Content>{tech.description}</Tooltip.Content>
								</Tooltip.Root>
							</Tooltip.Provider>
						{/each}
						</Item.Description>
					</Item.Content>
				</Item.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if wcagArray.length}
		<Tabs.Root value={wcagArray[0].slug}  class="row-span-2 col-span-6 lg:col-span-3">
			<Tabs.List>
				{#each wcagArray as wcag (wcag.id)}
				<Tabs.Trigger value={wcag.slug}>{wcag.name}</Tabs.Trigger>
				{/each}
			</Tabs.List>
			{#each wcagArray as wcag (wcag.id)}
			<Tabs.Content value={wcag.slug}>
				<ScrollArea class="h-150 object-center border p-4">
					<img src="/api/v1/screenshots/{wcag.id}" alt="{wcag.name} Screenshot" />
				</ScrollArea>
			</Tabs.Content>
			{/each}
		</Tabs.Root>
		{/if}
	
		<Card.Root class="row-span-2 col-span-6 lg:col-span-3 2xl:col-span-2 sm:min-w-105">
			<Card.Header>
				<!-- TODO centralize tool icons -->
					<!-- TODO link to full tool results -->
				<Card.Title class="capitalize">Your server is{job.probe?.cdn ? ' not' : ''} here</Card.Title>
			</Card.Header>
			<Card.Content>
				<Item.Root>
					<Item.Content>
						<Item.Title class="flex gap-2">
							<Icon icon="flagpack:{data.job.geo.countryCode.toLowerCase()}" />
							{data.job.geo.countryName}
						</Item.Title>
						<Item.Description>
							{data.job.geo.city}, {data.job.geo.zip}
						</Item.Description>
					</Item.Content>
				</Item.Root>
				<Globe
					width={400}
					height={430}
					scale={200}
					point={{ lat: data.job.geo.lat, lon: data.job.geo.lon }}
				/>
			</Card.Content>
		</Card.Root>

		{#if chartScores.length}
		<Card.Root class="row-span-2 col-span-6 lg:col-span-3 2xl:col-span-2 sm:min-w-105">
			<Card.Header>
				<!-- TODO centralize tool icons -->
					<!-- TODO link to full tool results -->
				<Card.Title class="capitalize">Score Summary</Card.Title>
			</Card.Header>
			<Card.Content>
				<ScoreChart scores={chartScores} />
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Tool</Table.Head>
							<Table.Head>Passes</Table.Head>
							<Table.Head>Warnings</Table.Head>
							<Table.Head>Errors</Table.Head>
							<Table.Head class="text-end">Score</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each chartScores as scoreRow (scoreRow.tool)}
						{@const results = getScoreResult(scoreRow)}
						<Table.Row>
							<Table.Cell class="font-medium">
								<Dialog.Root>
									<Dialog.Trigger type="button" class={buttonVariants({ variant: "link" })}>{scoreRow.label}</Dialog.Trigger>
									<Dialog.Content class="w-full max-w-11/12 sm:max-w-11/12 md:max-w-11/12 lg:max-w-4xl lg:w-4xl">
										<Dialog.Header>
										<Dialog.Title>Detailed Results for {scoreRow.label}</Dialog.Title>
										<Dialog.Description>
											<ScrollArea class="h-125 pr-2">
												<ScoreToolResults data={results} tool={scoreRow.tool.startsWith('wcag') ? 'wcag' : scoreRow.tool as Tool} />
											</ScrollArea>
										</Dialog.Description>
										</Dialog.Header>
									</Dialog.Content>
								</Dialog.Root>
								
							</Table.Cell>
							<Table.Cell class="text-accent">{scoreRow.tool === 'security' ? 'N/A' : (results?.passes ?? 0)}</Table.Cell>
							<Table.Cell class="text-warning">{results?.warnings ?? 0}</Table.Cell>
							<Table.Cell class="text-destructive">{results?.errors ?? 0}</Table.Cell>
							<Table.Cell class="text-end font-semibold">{(results?.score ?? 0).toFixed(2)}%</Table.Cell>
						</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
		{/if}

		{#if job.whois && (job.whois as ApiWhoisResult[]).length}
		<Card.Root class="col-span-6 xl:col-span-4">
			<Card.Header>
				<!-- TODO centralize tool icons -->
					<!-- TODO link to full tool results -->
				<Card.Title class="capitalize">Whois Results</Card.Title>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>IP</Table.Head>
							<Table.Head>Network</Table.Head>
							<Table.Head>Hoster</Table.Head>
							<Table.Head>Country</Table.Head>
							<Table.Head>AS</Table.Head>
							<Table.Head>Registry</Table.Head>
							<Table.Head>Registered on</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each (job.whois as ApiWhoisResult[]) as whois (whois.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{whois.ip}</Table.Cell>
							<Table.Cell>{whois.network}</Table.Cell>
							<Table.Cell>{whois.name}</Table.Cell>
							<Table.Cell class="flex gap-1 items-center"><Icon icon="flagpack:{whois.country.toLowerCase()}" />{whois.country}</Table.Cell>
							<Table.Cell>{whois.as}</Table.Cell>
							<Table.Cell>{whois.registry}</Table.Cell>
							<Table.Cell>{formatDate(whois.date)}</Table.Cell>
						</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
		{/if}

		{#if job.domain}
		{@const domain = job.domain as ApiDomainResult & { expires_in: number}}
		<Card.Root class="col-span-6 md:col-span-3 xl:col-span-2 sm:min-w-90">
			<Card.Header class="flex justify-between">
				<!-- TODO centralize tool icons -->
					<!-- TODO link to full tool results -->
				<Card.Title class="capitalize">Domain Results</Card.Title>
				{#if domain.expires_in > 0}
				<Badge>expires in {domain.expires_in} days</Badge>
				{:else if domain.expires_in < 0}
				<Badge variant="destructive">expired {Math.abs(domain.expires_in)} days ago!</Badge>
				{:else}
				<Badge variant="destructive">expires today!</Badge>
				{/if}
			</Card.Header>
			<Card.Content class="flex flex-col">
				<ul class="md:columns-2 gap-2" style="column-width: 230px;">
					<li class="flex gap-1 items-center"><strong>Registered On:</strong>{formatDate(domain.creationDate!)}</li>
					<li class="flex gap-1 items-center"><strong>Updated On:</strong>{formatDate(domain.updatedDate!)}</li>
					<li class="flex gap-1 items-center"><strong>Expires On:</strong>{formatDate(domain.expirationDate!)}</li>
					{#if domain.isIDN && (domain.punycodeName && domain.punycodeName.length) || (domain.unicodeName && domain.unicodeName.length)}
					<li class="flex gap-1 items-center"><strong>IDN:</strong>
						{#if domain.punycodeName && domain.punycodeName.length}
						<span>{domain.punycodeName}</span>
						{/if}
						{#if domain.unicodeName && domain.unicodeName.length}
						<span>{domain.unicodeName}</span>
						{/if}
					</li>
					{/if}
					<li class="flex gap-1 items-center">
						<strong>Registrar:</strong>
						{#if domain.registrar.url}
						- <Button href={domain.registrar.url} target="_blank" variant="link">{domain.registrar.name}</Button>
						{:else}
						{domain.registrar.name}
						{/if}
						{#if domain.registrar.email}
						- <Button href={`mailto:${domain.registrar.email}`} variant="link">{domain.registrar.email}</Button>
						{/if}
						{#if domain.registrar.phone}
						- <Button href={`tel:${domain.registrar.phone}`} variant="link">{domain.registrar.phone}</Button>
						{/if}
					</li>
				</ul>
				<ul class="flex justify-center my-2">
					<li class="flex gap-2" style="--spacing: 0.375rem;">
						<Badge variant="outline" class="text-sm">
						{#if domain.dnssecEnabled}
						<a href="https://en.wikipedia.org/wiki/Domain_Name_System_Security_Extensions" target="_blank" class="text-accent">DNSSEC</a>
						<ThumbsUpIcon color="var(--accent)" size={16} />
						{:else}
						<a href="https://en.wikipedia.org/wiki/Domain_Name_System_Security_Extensions" target="_blank" class="text-destructive">DNSSEC</a>
						<ThumbsDownIcon color="var(--destructive)" size={16} />
						{/if}
						</Badge>
						<Badge variant="outline" class="text-sm">
						{#if domain.privacyEnabled}
						<a href="https://en.wikipedia.org/wiki/Domain_privacy" target="_blank" class="text-accent">Privacy</a>
						<ThumbsUpIcon color="var(--accent)" size={16} />
						{:else}
						<a href="https://en.wikipedia.org/wiki/Domain_privacy" target="_blank" class="text-destructive">Privacy</a>
						<ThumbsDownIcon color="var(--destructive)" size={16} />
						{/if}
						</Badge>
						<Badge variant="outline" class="text-sm">
						{#if domain.transferLock}
						<a href="https://en.wikipedia.org/wiki/Registrar-Lock" target="_blank" class="text-accent">Transfer Lock</a>
						<ThumbsUpIcon color="var(--accent)" size={16} />
						{:else}
						<a href="https://en.wikipedia.org/wiki/Registrar-Lock" target="_blank" class="text-destructive">Transfer Lock</a>
						<ThumbsDownIcon color="var(--destructive)" size={16} />
						{/if}
						</Badge>
					</li>
				</ul>
				<Dialog.Root>
					<Dialog.Trigger type="button" class={"self-end " + buttonVariants({ variant: "default" })}>View DNS Records</Dialog.Trigger>
					<Dialog.Content class="w-full max-w-11/12 sm:max-w-11/12 md:max-w-11/12 lg:max-w-4xl lg:w-4xl">
						<Dialog.Header>
						<Dialog.Title>DNS Records of {domain.domain}</Dialog.Title>
						<Dialog.Description>
							<Alert.Root>
								<TriangleAlertIcon />
								<Alert.Title
								>This is not an exhaustive list, DNS servers often truncate responses (a.k.a. records might be missing)</Alert.Title
								>
							</Alert.Root>
							<ScrollArea class="h-125 pr-2">
								<DnsRecords {domain} />
							</ScrollArea>
						</Dialog.Description>
						</Dialog.Header>
					</Dialog.Content>
				</Dialog.Root>
			</Card.Content>
		</Card.Root>
		{/if}

		{#if job.ssl}
		{@const ssl = job.ssl as ApiSSLResult & { expires_in: number}}
		<Card.Root class="col-span-6 md:col-span-3 xl:col-span-2 sm:min-w-90">
			<Card.Header class="flex justify-between">
				<!-- TODO centralize tool icons -->
					<!-- TODO link to full tool results -->
				<Card.Title class="capitalize">SSL Results</Card.Title>
				{#if ssl.expires_in > 0}
				<Badge>expires in {ssl.expires_in} days</Badge>
				{:else if ssl.expires_in < 0}
				<Badge variant="destructive">expired {Math.abs(ssl.expires_in)} days ago!</Badge>
				{:else}
				<Badge variant="destructive">expires today!</Badge>
				{/if}
			</Card.Header>
			<Card.Content>
				<ul class="md:columns-2 gap-2" style="column-width: 230px;">
					<li class="flex gap-1 items-center"><strong>Valid From:</strong>{formatDate(ssl.valid_from)}</li>
					<li class="flex gap-1 items-center"><strong>Valid To:</strong>{formatDate(ssl.valid_to)}</li>
					<li class="flex gap-1 items-center"><strong>Protocol:</strong>{ssl.protocol}</li>
					<li class="flex gap-1 items-center"><strong>Certified Domain:</strong>{ssl.owner.domain}</li>
					{#if ssl.owner.name.length}
					<li class="flex gap-1 items-center">
						<strong>Owner:</strong>{ssl.owner.name}
						{#if ssl.owner.country.length}
						- <Icon icon="flagpack:{ssl.owner.country.toLowerCase()}" />
						{/if}
						{#if ssl.owner.address.length}
						- {ssl.owner.address}
						{/if}
					</li>
					{/if}
					{#if ssl.issuer.name.length}
					<li class="flex gap-1 items-center">
						<strong>Issuer:</strong>{ssl.issuer.name}
						{#if ssl.issuer.country.length}
						- <Icon icon="flagpack:{ssl.issuer.country.toLowerCase()}" />
						{/if}
						{#if ssl.issuer.domain.length}
						- {ssl.issuer.domain}
						{/if}
					</li>
					{/if}
				</ul>
			</Card.Content>
		</Card.Root>
		{/if}
	</div>
	<div class="flex justify-between">
		<Button href="/jobs" variant="outline">
			<ArrowLeftIcon class="size-4" />
			Back to list
		</Button>

		{#if isCompleted}
		<div class="flex flex-col items-end gap-1">
			<form method="POST" use:enhance={downloadPdfEnhance}>
				<Button variant="default" type="submit" disabled={isPdfDownloading}>
					<FileTextIcon class="size-4" />
					{isPdfDownloading ? 'Generating PDF...' : 'Get PDF Report'}
				</Button>
			</form>
			{#if pdfDownloadError}
				<p class="text-sm text-destructive">{pdfDownloadError}</p>
			{/if}
		</div>
		{/if}
	</div>
</div>
