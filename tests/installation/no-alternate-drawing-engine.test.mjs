import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const forbiddenEngines = [
	'lightweight-charts',
	'echarts',
	'chart.js',
	'highcharts',
];

async function collectSourceFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...await collectSourceFiles(path));
		} else if (/\.(?:ts|py)$/u.test(entry.name)) {
			files.push(path);
		}
	}
	return files;
}

test('the dependency tree contains exactly one chart engine at the pinned version', async () => {
	const output = execFileSync(
		process.env.npm_execpath ?? 'npm',
		['ls', 'klinecharts', '--parseable'],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
	);
	const lines = output.trim().split('\n').filter(Boolean);
	assert.equal(lines.length, 1, `expected a single klinecharts install: ${output}`);
	assert.match(lines[0], /klinecharts(?:@10\.0\.0)?$/u);
});

test('no alternate chart engine appears in manifests or the lockfile', async () => {
	const manifests = [
		'package.json',
		'packages/scene-schema/package.json',
		'packages/klinecharts-adapter/package.json',
		'packages/web-runtime/package.json',
		'packages/render-runtime/package.json',
		'packages/cli/package.json',
	];
	for (const path of manifests) {
		const source = await readFile(path, 'utf8');
		for (const engine of forbiddenEngines) {
			assert.doesNotMatch(source, new RegExp(`"${engine}"`), `${path} references ${engine}`);
		}
	}
	const lock = await readFile('package-lock.json', 'utf8');
	for (const engine of forbiddenEngines) {
		assert.doesNotMatch(lock, new RegExp(`"${engine}"`), `lockfile references ${engine}`);
	}
	const adapter = JSON.parse(
		await readFile('packages/klinecharts-adapter/package.json', 'utf8'),
	);
	assert.equal(adapter.dependencies.klinecharts, '10.0.0');
});

test('public Runtime, Schema, and Python sources do not create business canvases', async () => {
	const roots = [
		'packages/web-runtime/src',
		'packages/scene-schema/src',
		'python/baron-klinecharts/src',
	];
	const forbidden = /createElement\(['"]canvas['"]\)|new OffscreenCanvas|CanvasRenderingContext2D/u;
	for (const root of roots) {
		for (const file of await collectSourceFiles(root)) {
			const content = await readFile(file, 'utf8');
			assert.doesNotMatch(
				content,
				forbidden,
				`${relative('.', file)} contains a business canvas API`,
			);
		}
	}
});

test('published manifests and the lockfile have no live-source or workspace dependency links', async () => {
	const forbiddenDependency = /(?:file:|workspace:|git\+|packages\/.+src)/u;
	for (const path of [
		'package.json',
		'packages/scene-schema/package.json',
		'packages/klinecharts-adapter/package.json',
		'packages/web-runtime/package.json',
		'packages/render-runtime/package.json',
		'packages/cli/package.json',
	]) {
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
			for (const spec of Object.values(manifest[section] ?? {})) {
				assert.doesNotMatch(
					String(spec),
					forbiddenDependency,
					`${path} declares a live-source dependency: ${spec}`,
				);
			}
		}
	}
	const lock = await readFile('package-lock.json', 'utf8');
	assert.doesNotMatch(lock, /"file:|git\+|workspace:/u);
});
