import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const forbiddenPaths = [
	'src',
	'website',
	'debug',
	'indicator-examples',
	'plugin-examples',
	'packages/create-lwc-plugin',
	'tests/e2e',
	'tests/type-checks',
	'tests/unittests',
	'rollup.config.js',
];

test('legacy repository paths are absent', async () => {
	for (const path of forbiddenPaths) {
		await assert.rejects(access(path), `legacy path still exists: ${path}`);
	}
});

test('the lockfile has no legacy engine dependency', async () => {
	const lock = await readFile('package-lock.json', 'utf8');
	assert.doesNotMatch(lock, /"lightweight-charts"/);
});

test('public manifests expose KLineCharts as the only chart engine', async () => {
	const manifests = [
		'package.json',
		'packages/klinecharts-adapter/package.json',
		'packages/web-runtime/package.json',
		'packages/cli/package.json',
	];
	for (const path of manifests) {
		const source = await readFile(path, 'utf8');
		assert.doesNotMatch(source, /"lightweight-charts"/);
	}
	const adapter = await readFile('packages/klinecharts-adapter/package.json', 'utf8');
	assert.match(adapter, /"klinecharts": "10\.0\.0"/);
});
