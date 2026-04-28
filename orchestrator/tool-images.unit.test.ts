import { describe, expect, test } from 'bun:test';
import type { Tool } from './types';
import {
	DEFAULT_TOOL_IMAGE_REMOTE_BASE,
	DEFAULT_TOOL_IMAGE_TAG,
	prepareToolImages,
	resolveToolImageSource,
	type ResolvedToolImageSource
} from './tool-images';

type FakeImageTagCall = {
	from: string;
	repo: string;
	tag: string;
};

class FakeDocker {
	localImages = new Set<string>();
	pulledImages = new Set<string>();
	buildCalls: Array<{ t: string; dockerfile: string; src: string[] }> = [];
	pullCalls: string[] = [];
	tagCalls: FakeImageTagCall[] = [];
	pullFailures = new Set<string>();
	progressError: Error | null = null;
	progressEvents: unknown[] = [];

	readonly modem = {
		followProgress: (
			_stream: unknown,
			callback: (error: Error | null, result: unknown[]) => void
		): void => callback(this.progressError, this.progressEvents)
	};

	getImage = (name: string) => ({
		inspect: async (): Promise<{ RepoTags?: string[] }> => {
			if (
				this.localImages.has(name) ||
				this.localImages.has(`${name}:latest`) ||
				this.pulledImages.has(name)
			) {
				return {};
			}
			const error = Object.assign(new Error(`Image not found: ${name}`), { statusCode: 404 });
			throw error;
		},
		tag: async ({ repo, tag }: { repo: string; tag: string }): Promise<void> => {
			this.tagCalls.push({
				from: name,
				repo,
				tag
			});
			this.localImages.add(repo);
			this.localImages.add(`${repo}:${tag}`);
		}
	});

	buildImage = async (
		file: { context: string; src: string[] },
		options: { t: string; dockerfile: string }
	): Promise<object> => {
		this.buildCalls.push({
			t: options.t,
			dockerfile: options.dockerfile,
			src: file.src
		});
		this.localImages.add(options.t);
		this.localImages.add(`${options.t}:latest`);
		return {};
	};

	pull = (image: string, callback: (error: unknown, stream?: unknown) => void): void => {
		this.pullCalls.push(image);
		if (this.pullFailures.has(image)) {
			callback(new Error(`Pull failed for ${image}`));
			return;
		}
		this.pulledImages.add(image);
		callback(null, {});
	};

	getContainer = (_id: string) => ({
		inspect: async (): Promise<{ Config?: { Image?: string }; Image?: string }> => ({
			Config: { Image: 'ghcr.io/rallisf1/hesperida-orchestrator:latest' },
			Image: 'sha256:orchestrator'
		})
	});
}

const TEST_TOOLS: Tool[] = ['probe'];

describe('resolveToolImageSource', () => {
	test('uses explicit semver tag from config image', () => {
		const result = resolveToolImageSource('ghcr.io/rallisf1/hesperida-orchestrator:0.10.4', []);
		expect(result.remoteBase).toBe('ghcr.io/rallisf1/hesperida');
		expect(result.versionTag).toBe('0.10.4');
		expect(result.versionSource).toBe('config_image');
	});

	test('uses explicit sha tag from config image', () => {
		const result = resolveToolImageSource(
			'ghcr.io/rallisf1/hesperida-orchestrator:sha-abc123def456',
			[]
		);
		expect(result.remoteBase).toBe('ghcr.io/rallisf1/hesperida');
		expect(result.versionTag).toBe('sha-abc123def456');
		expect(result.versionSource).toBe('config_image');
	});

	test('uses repo tags when config tag is latest', () => {
		const result = resolveToolImageSource('ghcr.io/rallisf1/hesperida-orchestrator:latest', [
			'ghcr.io/rallisf1/hesperida-orchestrator:latest',
			'ghcr.io/rallisf1/hesperida-orchestrator:0.10.4'
		]);
		expect(result.remoteBase).toBe('ghcr.io/rallisf1/hesperida');
		expect(result.versionTag).toBe('0.10.4');
		expect(result.versionSource).toBe('repo_tags');
	});

	test('falls back to latest for local-build style refs', () => {
		const result = resolveToolImageSource('hesperida-orchestrator:latest', [
			'hesperida-orchestrator:latest'
		]);
		expect(result.remoteBase).toBe(DEFAULT_TOOL_IMAGE_REMOTE_BASE);
		expect(result.versionTag).toBe(DEFAULT_TOOL_IMAGE_TAG);
		expect(result.baseSource).toBe('default');
		expect(result.versionSource).toBe('fallback_latest');
	});

	test('falls back cleanly when metadata is missing or partial', () => {
		const result = resolveToolImageSource(null, ['<none>:<none>']);
		expect(result.remoteBase).toBe(DEFAULT_TOOL_IMAGE_REMOTE_BASE);
		expect(result.versionTag).toBe(DEFAULT_TOOL_IMAGE_TAG);
		expect(result.baseSource).toBe('default');
		expect(result.versionSource).toBe('fallback_latest');
	});
});

describe('prepareToolImages', () => {
	test('development mode builds missing tool images', async () => {
		const docker = new FakeDocker();
		await prepareToolImages({
			docker,
			tools: TEST_TOOLS,
			nodeEnv: 'development',
			rebuild: false,
			readDir: async () => ['Dockerfile', 'index.ts', '.env', 'node_modules']
		});
		expect(docker.buildCalls.length).toBe(1);
		expect(docker.buildCalls[0]?.t).toBe('hesperida-probe');
		expect(docker.buildCalls[0]?.src).toEqual(['probe/Dockerfile', 'probe/index.ts']);
	});

	test('development mode skips build when image exists and rebuild is disabled', async () => {
		const docker = new FakeDocker();
		docker.localImages.add('hesperida-probe');
		await prepareToolImages({
			docker,
			tools: TEST_TOOLS,
			nodeEnv: 'development',
			rebuild: false,
			readDir: async () => ['Dockerfile']
		});
		expect(docker.buildCalls.length).toBe(0);
	});

	test('development mode rebuilds when rebuild flag is enabled', async () => {
		const docker = new FakeDocker();
		docker.localImages.add('hesperida-probe');
		await prepareToolImages({
			docker,
			tools: TEST_TOOLS,
			nodeEnv: 'development',
			rebuild: true,
			readDir: async () => ['Dockerfile']
		});
		expect(docker.buildCalls.length).toBe(1);
	});

	test('non-development mode pulls and retags using resolved version', async () => {
		const docker = new FakeDocker();
		const resolved: ResolvedToolImageSource = {
			remoteBase: 'ghcr.io/rallisf1/hesperida',
			versionTag: '0.10.4',
			baseSource: 'config_image',
			versionSource: 'config_image',
			configImage: 'ghcr.io/rallisf1/hesperida-orchestrator:0.10.4'
		};
		await prepareToolImages({
			docker,
			tools: ['probe', 'seo'],
			nodeEnv: 'production',
			resolveImageSource: async () => resolved
		});

		expect(docker.pullCalls).toEqual([
			'ghcr.io/rallisf1/hesperida-probe:0.10.4',
			'ghcr.io/rallisf1/hesperida-seo:0.10.4'
		]);
		expect(docker.tagCalls).toEqual([
			{
				from: 'ghcr.io/rallisf1/hesperida-probe:0.10.4',
				repo: 'hesperida-probe',
				tag: 'latest'
			},
			{
				from: 'ghcr.io/rallisf1/hesperida-probe:0.10.4',
				repo: 'hesperida-probe',
				tag: '0.10.4'
			},
			{
				from: 'ghcr.io/rallisf1/hesperida-seo:0.10.4',
				repo: 'hesperida-seo',
				tag: 'latest'
			},
			{
				from: 'ghcr.io/rallisf1/hesperida-seo:0.10.4',
				repo: 'hesperida-seo',
				tag: '0.10.4'
			}
		]);
	});

	test('non-development mode surfaces pull failures', async () => {
		const docker = new FakeDocker();
		const ref = 'ghcr.io/rallisf1/hesperida-probe:0.10.4';
		docker.pullFailures.add(ref);
		await expect(
			prepareToolImages({
				docker,
				tools: TEST_TOOLS,
				nodeEnv: 'production',
				resolveImageSource: async () => ({
					remoteBase: 'ghcr.io/rallisf1/hesperida',
					versionTag: '0.10.4',
					baseSource: 'config_image',
					versionSource: 'config_image',
					configImage: 'ghcr.io/rallisf1/hesperida-orchestrator:0.10.4'
				})
			})
		).rejects.toThrow('Pull failed for ghcr.io/rallisf1/hesperida-probe:0.10.4');
	});

	test('development mode surfaces stream-level build errors from followProgress result', async () => {
		const docker = new FakeDocker();
		docker.progressEvents = [{ error: 'failed to solve: alpine:latest not found' }];
		await expect(
			prepareToolImages({
				docker,
				tools: TEST_TOOLS,
				nodeEnv: 'development',
				readDir: async () => ['Dockerfile']
			})
		).rejects.toThrow('failed to solve: alpine:latest not found');
	});
});
