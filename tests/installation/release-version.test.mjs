import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
	checkReleaseVersion,
	createReleasePlan,
} from '../../tools/release/check-release-version.mjs';

const workspaceManifests = [
	{
		path: 'packages/scene-schema',
		name: '@baron1996/kline-scene-schema',
		version: '0.1.0',
	},
	{
		path: 'packages/klinecharts-adapter',
		name: '@baron1996/klinecharts-adapter',
		version: '0.1.1',
		dependencies: {
			'@baron1996/kline-scene-schema': '0.1.0',
		},
	},
	{
		path: 'packages/web-runtime',
		name: '@baron1996/klinecharts-runtime',
		version: '0.1.1',
		dependencies: {
			'@baron1996/kline-scene-schema': '0.1.0',
			'@baron1996/klinecharts-adapter': '0.1.1',
		},
	},
	{
		path: 'packages/render-runtime',
		name: '@baron1996/klinecharts-render-runtime',
		version: '0.1.0',
		private: true,
		dependencies: {
			'@baron1996/kline-scene-schema': '0.1.0',
			'@baron1996/klinecharts-runtime': '0.1.1',
		},
	},
	{
		path: 'packages/cli',
		name: '@baron1996/klinecharts-cli',
		version: '0.1.0',
		dependencies: {
			'@baron1996/kline-scene-schema': '0.1.0',
		},
	},
];

async function createRepository({
	rootVersion = '0.1.1',
	pythonVersion = '0.1.0',
	mutateManifests,
} = {}) {
	const root = await mkdtemp(join(tmpdir(), 'baron-release-version-'));
	await writeFile(
		join(root, 'package.json'),
		JSON.stringify({ version: rootVersion }),
	);
	const manifests = structuredClone(workspaceManifests);
	mutateManifests?.(manifests);
	for (const { path, ...manifest } of manifests) {
		const directory = join(root, path);
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
	}
	const pythonDirectory = join(root, 'python', 'baron-klinecharts');
	await mkdir(pythonDirectory, { recursive: true });
	await writeFile(
		join(pythonDirectory, 'pyproject.toml'),
		`[project]\nname = "baron-klinecharts"\nversion = "${pythonVersion}"\n`,
	);
	return root;
}

test('plans only public npm packages matching the stable patch tag', async () => {
	const root = await createRepository();
	const plan = await createReleasePlan({ root, tag: 'v0.1.1' });
	assert.deepEqual(plan, {
		version: '0.1.1',
		npmPackages: [
			'@baron1996/klinecharts-adapter',
			'@baron1996/klinecharts-runtime',
		],
		publishPython: false,
	});
	assert.equal(await checkReleaseVersion({ root, tag: 'v0.1.1' }), '0.1.1');
});

test('includes Python only when its project version matches the tag', async () => {
	const root = await createRepository({ pythonVersion: '0.1.1' });
	assert.equal(
		(await createReleasePlan({ root, tag: 'v0.1.1' })).publishPython,
		true,
	);
});

test('rejects a tag without the required v prefix', async () => {
	const root = await createRepository();
	await assert.rejects(
		createReleasePlan({ root, tag: '0.1.1' }),
		/invalid stable release tag/u,
	);
});

test('rejects a tag that differs from the root package', async () => {
	const root = await createRepository();
	await assert.rejects(
		createReleasePlan({ root, tag: 'v0.2.0' }),
		/package\.json declares 0\.1\.1/u,
	);
});

test('rejects a tag with no public npm or Python publication target', async () => {
	const root = await createRepository({
		rootVersion: '0.1.2',
		pythonVersion: '0.1.0',
	});
	await assert.rejects(
		createReleasePlan({ root, tag: 'v0.1.2' }),
		/no public release target/u,
	);
});

test('rejects an internal dependency that is not pinned to the local package version', async () => {
	const root = await createRepository({
		mutateManifests(manifests) {
			const runtime = manifests.find(
				(manifest) => manifest.name === '@baron1996/klinecharts-runtime',
			);
			runtime.dependencies['@baron1996/klinecharts-adapter'] = '0.1.0';
		},
	});
	await assert.rejects(
		createReleasePlan({ root, tag: 'v0.1.1' }),
		/@baron1996\/klinecharts-runtime.+@baron1996\/klinecharts-adapter.+0\.1\.1/u,
	);
});

test('rejects missing tag input', async () => {
	const root = await createRepository();
	await assert.rejects(
		createReleasePlan({ root, tag: '' }),
		/release tag is required/u,
	);
});
