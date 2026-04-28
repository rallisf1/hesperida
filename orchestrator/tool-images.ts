import { readdir as defaultReadDir } from 'node:fs/promises';
import { hostname } from 'node:os';
import Dockerode from 'dockerode';
import type { Tool } from './types';

const ORCHESTRATOR_IMAGE_SUFFIX = '-orchestrator';
const TOOL_IMAGE_BUILD_CONTEXT = '/tools';

export const DEFAULT_TOOL_IMAGE_REMOTE_BASE = 'ghcr.io/rallisf1/hesperida';
export const DEFAULT_TOOL_IMAGE_TAG = 'latest';

type VersionSource = 'config_image' | 'repo_tags' | 'fallback_latest';
type BaseSource = 'config_image' | 'repo_tags' | 'default';

type Logger = {
	log: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	debug?: (...args: unknown[]) => void;
};

type DockerImageHandle = {
	inspect: () => Promise<{ RepoTags?: string[] } | unknown>;
	tag: (options: { repo: string; tag: string }) => Promise<unknown>;
};

type DockerContainerHandle = {
	inspect: () => Promise<{ Config?: { Image?: string }; Image?: string }>;
};

type ParsedImageReference = {
	repository: string;
	tag: string | null;
};

export type ResolvedToolImageSource = {
	remoteBase: string;
	versionTag: string;
	baseSource: BaseSource;
	versionSource: VersionSource;
	configImage: string | null;
};

type ResolveSelfToolImageSourceOptions = {
	docker: Dockerode;
	logger?: Logger;
	debug?: boolean;
	selfContainerId?: string;
};

type PrepareToolImagesOptions = {
	docker: Dockerode;
	tools: readonly Tool[];
	nodeEnv?: string;
	rebuild?: boolean;
	debug?: boolean;
	logger?: Logger;
	readDir?: (path: string) => Promise<string[]>;
	resolveImageSource?: () => Promise<ResolvedToolImageSource>;
};

const parseImageReference = (imageReference: string | null | undefined): ParsedImageReference | null => {
	const raw = imageReference?.trim() ?? '';
	if (!raw.length || raw === '<none>:<none>') return null;
	const withoutDigest = raw.split('@', 1)[0] ?? '';
	if (!withoutDigest.length) return null;

	const lastSlash = withoutDigest.lastIndexOf('/');
	const lastColon = withoutDigest.lastIndexOf(':');
	const hasTag = lastColon > lastSlash;
	const repository = hasTag ? withoutDigest.slice(0, lastColon) : withoutDigest;
	const tag = hasTag ? withoutDigest.slice(lastColon + 1) : null;
	if (!repository.length) return null;

	return {
		repository,
		tag: tag?.length ? tag : null
	};
};

const isUsableVersionTag = (tag: string | null): tag is string =>
	Boolean(tag && tag !== DEFAULT_TOOL_IMAGE_TAG && tag !== '<none>');

const versionTagRank = (tag: string): number => {
	if (/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(tag)) return 0;
	if (/^sha-[0-9a-f]{7,}$/i.test(tag)) return 1;
	return 2;
};

const pickPreferredVersionTag = (tags: string[]): string | null => {
	let best: string | null = null;
	let bestRank = Number.POSITIVE_INFINITY;
	for (const tag of tags) {
		const rank = versionTagRank(tag);
		if (rank < bestRank) {
			best = tag;
			bestRank = rank;
		}
	}
	return best;
};

const resolveRemoteBaseFromRepository = (repository: string): string | null => {
	if (!repository.endsWith(ORCHESTRATOR_IMAGE_SUFFIX)) return null;
	const base = repository.slice(0, -ORCHESTRATOR_IMAGE_SUFFIX.length);
	if (!base.length || !base.includes('/')) return null;
	return base;
};

const getRepoTagCandidates = (
	repoTags: string[]
): { remoteBase: string | null; versionTag: string | null }[] =>
	repoTags
		.map(parseImageReference)
		.filter((parsed): parsed is ParsedImageReference => parsed !== null)
		.filter((parsed) => parsed.repository.endsWith(ORCHESTRATOR_IMAGE_SUFFIX))
		.map((parsed) => ({
			remoteBase: resolveRemoteBaseFromRepository(parsed.repository),
			versionTag: parsed.tag
		}));

export const resolveToolImageSource = (
	configImage: string | null | undefined,
	repoTags: string[]
): ResolvedToolImageSource => {
	const parsedConfigImage = parseImageReference(configImage);
	const configBase = parsedConfigImage ? resolveRemoteBaseFromRepository(parsedConfigImage.repository) : null;
	const configTag = parsedConfigImage?.tag ?? null;

	const repoCandidates = getRepoTagCandidates(repoTags);
	const repoBaseCandidate = repoCandidates.find((candidate) => Boolean(candidate.remoteBase))?.remoteBase ?? null;
	const repoTagsNonLatest = repoCandidates
		.map((candidate) => candidate.versionTag)
		.filter((tag): tag is string => isUsableVersionTag(tag));
	const repoPreferredVersionTag = pickPreferredVersionTag(repoTagsNonLatest);

	const remoteBase = configBase ?? repoBaseCandidate ?? DEFAULT_TOOL_IMAGE_REMOTE_BASE;
	const versionTag = isUsableVersionTag(configTag)
		? configTag
		: repoPreferredVersionTag ?? DEFAULT_TOOL_IMAGE_TAG;

	return {
		remoteBase,
		versionTag,
		baseSource: configBase ? 'config_image' : repoBaseCandidate ? 'repo_tags' : 'default',
		versionSource: isUsableVersionTag(configTag)
			? 'config_image'
			: repoPreferredVersionTag
				? 'repo_tags'
				: 'fallback_latest',
		configImage: configImage?.trim().length ? configImage.trim() : null
	};
};

const getDockerStreamError = (events: unknown[]): Error | null => {
	for (const event of events) {
		if (!event || typeof event !== 'object') continue;
		const item = event as {
			error?: unknown;
			errorDetail?: { message?: unknown } | unknown;
		};
		const directError = typeof item.error === 'string' ? item.error : null;
		const detailMessage =
			item.errorDetail &&
			typeof item.errorDetail === 'object' &&
			'message' in item.errorDetail &&
			typeof (item.errorDetail as { message?: unknown }).message === 'string'
				? ((item.errorDetail as { message?: string }).message ?? null)
				: null;
		const message = directError ?? detailMessage;
		if (!message) continue;
		return new Error(message);
	}
	return null;
};

const followDockerProgress = async (docker: Dockerode, stream: NodeJS.ReadableStream): Promise<void> => {
	await new Promise<void>((resolve, reject) => {
		docker.modem.followProgress(stream, (error, result) => {
			if (error) {
				reject(error);
				return;
			}
			const streamError = getDockerStreamError(Array.isArray(result) ? result : []);
			if (streamError) {
				reject(streamError);
				return;
			}
			resolve();
		});
	});
};

const pullImage = async (docker: Dockerode, image: string): Promise<void> => {
	const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
		docker.pull(image, (error: any, pullStream: NodeJS.ReadableStream) => {
			if (error) {
				reject(error);
				return;
			}
			if (!pullStream) {
				reject(new Error(`Docker pull for ${image} did not provide a stream.`));
				return;
			}
			resolve(pullStream);
		});
	});
	await followDockerProgress(docker, stream);
};

const buildImage = async (
	docker: Dockerode,
	tool: Tool,
	localImageName: string,
	readDir: (path: string) => Promise<string[]>
): Promise<void> => {
	const files = await readDir(`${TOOL_IMAGE_BUILD_CONTEXT}/${tool}`);
	const src = files
		.filter((file) => file !== 'node_modules' && !file.startsWith('.'))
		.map((file) => `${tool}/${file}`);
	const stream = await docker.buildImage(
		{
			context: TOOL_IMAGE_BUILD_CONTEXT,
			src
		},
		{
			t: localImageName,
			dockerfile: `${tool}/Dockerfile`
		}
	);
	await followDockerProgress(docker, stream);
};

const hasLocalImage = async (docker: Dockerode, imageName: string): Promise<boolean> => {
	try {
		await docker.getImage(imageName).inspect();
		return true;
	} catch (error) {
		const statusCode =
			typeof error === 'object' && error !== null && 'statusCode' in error
				? (error as { statusCode?: unknown }).statusCode
				: undefined;
		if (statusCode === 404) return false;
		throw error;
	}
};

export const resolveSelfToolImageSource = async ({
	docker,
	logger = console,
	debug = false,
	selfContainerId = hostname()
}: ResolveSelfToolImageSourceOptions): Promise<ResolvedToolImageSource> => {
	const containerInfo = await docker.getContainer(selfContainerId).inspect();
	const configImage = containerInfo.Config?.Image ?? null;
	const imageIdentifier = containerInfo.Image ?? configImage ?? '';
	let repoTags: string[] = [];

	if (imageIdentifier.length) {
		try {
			const imageInfo = (await docker.getImage(imageIdentifier).inspect()) as { RepoTags?: string[] };
			if (Array.isArray(imageInfo.RepoTags)) repoTags = imageInfo.RepoTags;
		} catch (error) {
			logger.warn('Could not inspect orchestrator image RepoTags. Falling back to Config.Image parsing only.', error);
		}
	}

	const resolved = resolveToolImageSource(configImage, repoTags);
	if (resolved.versionSource === 'fallback_latest') {
		logger.warn(
			`Could not resolve a non-latest orchestrator version tag from "${resolved.configImage ?? 'unknown'}". Falling back to "${DEFAULT_TOOL_IMAGE_TAG}".`
		);
	}
	if (debug && logger.debug) {
		logger.debug(
			`Tool image source resolved: base=${resolved.remoteBase} (from ${resolved.baseSource}), tag=${resolved.versionTag} (from ${resolved.versionSource}).`
		);
	}
	return resolved;
};

export const prepareToolImages = async ({
	docker,
	tools,
	nodeEnv,
	rebuild = false,
	debug = false,
	logger = console,
	readDir = defaultReadDir,
	resolveImageSource
}: PrepareToolImagesOptions): Promise<void> => {
	const isDevelopment = nodeEnv === 'development';

	if (isDevelopment) {
		for (const tool of tools) {
			const localImageName = `hesperida-${tool}`;
			const imageExists = await hasLocalImage(docker, localImageName);
			if (debug && logger.debug) {
				logger.debug(`Docker image ${localImageName} ${imageExists ? 'found' : 'NOT found'}.`);
			}
			if (imageExists && !rebuild) continue;
			logger.log(`${rebuild ? 'Re-' : ''}Building image ${localImageName}...`);
			await buildImage(docker, tool, localImageName, readDir);
		}
		return;
	}

	const resolved = resolveImageSource
		? await resolveImageSource()
		: await resolveSelfToolImageSource({ docker, logger, debug });

	for (const tool of tools) {
		const localImageName = `hesperida-${tool}`;
		const remoteImageName = `${resolved.remoteBase}-${tool}:${resolved.versionTag}`;
		logger.log(`Pulling image ${remoteImageName}...`);
		await pullImage(docker, remoteImageName);
		await docker.getImage(remoteImageName).tag({ repo: localImageName, tag: DEFAULT_TOOL_IMAGE_TAG });
		if (resolved.versionTag !== DEFAULT_TOOL_IMAGE_TAG) {
			await docker.getImage(remoteImageName).tag({ repo: localImageName, tag: resolved.versionTag });
		}
	}
};
