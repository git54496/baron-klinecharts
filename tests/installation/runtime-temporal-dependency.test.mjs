import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { packPublicPackages, runNpm } from './helpers/pack.mjs';

test('packed Runtime resolves its exact Temporal polyfill without workspace hoist', async () => {
	const { directory, packages } = await packPublicPackages();
	const [sceneSchema, adapter, runtime] = packages;
	const consumer = join(directory, 'consumer');
	await mkdir(consumer, { recursive: true });
	await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
	runNpm(
		[
			'install',
			'--ignore-scripts',
			sceneSchema.tarball,
			adapter.tarball,
			runtime.tarball,
		],
		{ cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
	);

	const adapterPackage = JSON.parse(
		await readFile(
			join(
				consumer,
				'node_modules',
				'@baron1996',
				'klinecharts-adapter',
				'package.json',
			),
			'utf8',
		),
	);
	assert.equal(
		adapterPackage.dependencies['@js-temporal/polyfill'],
		undefined,
		'adapter must not declare or re-export the Temporal polyfill',
	);
	const runtimePackage = JSON.parse(
		await readFile(
			join(
				consumer,
				'node_modules',
				'@baron1996',
				'klinecharts-runtime',
				'package.json',
			),
			'utf8',
		),
	);
	assert.equal(
		runtimePackage.dependencies['@js-temporal/polyfill'],
		'0.5.1',
		'runtime must declare the exact Temporal polyfill version',
	);

	const script = [
		"import assert from 'node:assert/strict';",
		"import { createDrawableWorkspaceRuntime, DrawingProjectionService } from '@baron1996/klinecharts-runtime';",
		"const runtimeUrl = import.meta.resolve('@baron1996/klinecharts-runtime');",
		"assert.ok(runtimeUrl.startsWith('file://' + process.cwd() + '/node_modules/'), runtimeUrl);",
		"const temporalUrl = import.meta.resolve('@js-temporal/polyfill');",
		"assert.ok(temporalUrl.startsWith('file://' + process.cwd() + '/node_modules/'), temporalUrl);",
		"assert.equal(typeof createDrawableWorkspaceRuntime, 'function', 'Workspace runtime factory must be exported');",
		"const service = new DrawingProjectionService();",
		"const spring = service.addPeriod(1772946000000, { type: 'day', span: 1 }, 'America/New_York');",
		"assert.equal(spring, 1773028800000, 'DST spring day must be 23 hours');",
		"const fall = service.addPeriod(1793509200000, { type: 'day', span: 1 }, 'America/New_York');",
		"assert.equal(fall, 1793599200000, 'DST fall day must be 25 hours');",
		"const month = service.addPeriod(1769922000000, { type: 'month', span: 1 }, 'America/New_York');",
		"assert.equal(month, 1772341200000, 'February 2026 must add to March 1');",
	].join('\n');
	execFileSync(
		process.execPath,
		['--input-type=module', '--eval', script],
		{ cwd: consumer, stdio: 'inherit' },
	);
});
