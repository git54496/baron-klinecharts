import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
	buildNpmArtifacts,
	publicPackageDirectories,
	validatePublicManifest,
} from '../../tools/release/build-npm-artifacts.mjs';

const publicPackageNames = [
	'@baron1996/kline-scene-schema',
	'@baron1996/klinecharts-adapter',
	'@baron1996/klinecharts-runtime',
	'@baron1996/klinecharts-cli',
];

test('builds exactly four ordered public npm tarballs with integrity metadata', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'baron-release-artifacts-'));
	const outputDirectory = join(directory, 'npm');
	const result = await buildNpmArtifacts({
		root: process.cwd(),
		outputDirectory,
	});

	assert.deepEqual(publicPackageDirectories, [
		'packages/scene-schema',
		'packages/klinecharts-adapter',
		'packages/web-runtime',
		'packages/cli',
	]);
	assert.deepEqual(
		result.packages.map((entry) => entry.name),
		publicPackageNames,
	);
	assert.equal(result.packages.length, 4);
	for (const entry of result.packages) {
		assert.equal(entry.version, '0.1.0');
		assert.match(entry.filename, /\.tgz$/u);
		assert.match(entry.sha256, /^[a-f0-9]{64}$/u);
		assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
		await access(join(outputDirectory, entry.filename));
	}

	const manifest = JSON.parse(
		await readFile(join(outputDirectory, 'npm-artifacts.json'), 'utf8'),
	);
	assert.deepEqual(manifest, result);
	const checksums = await readFile(
		join(outputDirectory, 'SHA256SUMS'),
		'utf8',
	);
	for (const entry of result.packages) {
		assert.match(checksums, new RegExp(`${entry.sha256}  ${entry.filename}`));
	}
});

test('refuses to overwrite a non-empty release directory', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'baron-release-non-empty-'));
	const outputDirectory = join(directory, 'npm');
	await mkdir(outputDirectory);
	await writeFile(join(outputDirectory, 'existing.txt'), 'do not replace');
	await assert.rejects(
		buildNpmArtifacts({ root: process.cwd(), outputDirectory }),
		/output directory must be empty/u,
	);
});

test('rejects private manifests and workspace dependency links', () => {
	assert.throws(
		() =>
			validatePublicManifest({
				name: '@baron1996/private',
				version: '0.1.0',
				private: true,
				publishConfig: {
					access: 'public',
					registry: 'https://registry.npmjs.org/',
				},
			}),
		/must not be private/u,
	);
	assert.throws(
		() =>
			validatePublicManifest({
				name: '@baron1996/workspace-link',
				version: '0.1.0',
				publishConfig: {
					access: 'public',
					registry: 'https://registry.npmjs.org/',
				},
				dependencies: {
					'@baron1996/dependency': 'workspace:*',
				},
			}),
		/workspace dependency/u,
	);
});
