import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('workspace manifest exposes only the KLineCharts scene packages', async () => {
	const manifest = JSON.parse(await readFile('package.json', 'utf8'));

	assert.equal(manifest.name, '@baron1996/klinecharts-scene-workspace');
	assert.equal(manifest.version, '0.1.0');
	assert.deepEqual(manifest.workspaces, [
		'packages/scene-schema',
		'packages/klinecharts-adapter',
		'packages/web-runtime',
		'packages/render-runtime',
		'packages/cli',
	]);
	assert.equal(manifest.engines.node, '^22.12.0 || ^24.0.0');
	assert.equal(manifest.packageManager, 'npm@10.8.2');
	assert.match(
		manifest.scripts.generate,
		/npm run sync:python --workspace @baron1996\/klinecharts-render-runtime && npm run build --workspace @baron1996\/klinecharts-render-runtime/u,
	);
	assert.equal(manifest.scripts['pretest:cross-language'], 'npm run build --workspaces');
});
