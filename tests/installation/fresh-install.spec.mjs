import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { packPublicPackages, runNpm } from './helpers/pack.mjs';

test('packed npm artifacts install and run without workspace links', async () => {
	const { directory, packages } = await packPublicPackages();
	const consumer = join(directory, 'consumer');
	await mkdir(consumer);
	await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
	runNpm(
		[
			'install',
			'--ignore-scripts',
			...packages.map((packed) => packed.tarball),
		],
		{ cwd: consumer, stdio: 'inherit' },
	);
	await writeFile(
		join(consumer, 'smoke.mjs'),
		[
			"import { readFile } from 'node:fs/promises';",
			"import { parseChartScene } from '@baron1996/kline-scene-schema';",
			"import { WEB_RUNTIME_PACKAGE_VERSION } from '@baron1996/klinecharts-runtime';",
			"import { ADAPTER_PACKAGE_VERSION } from '@baron1996/klinecharts-adapter';",
			"const scene = JSON.parse(await readFile(process.argv[2], 'utf8'));",
			"if (parseChartScene(scene).version !== 1) throw new Error('Scene import failed.');",
			"if (WEB_RUNTIME_PACKAGE_VERSION !== '0.1.0') throw new Error('Web Runtime import failed.');",
			"if (ADAPTER_PACKAGE_VERSION !== '0.1.0') throw new Error('Adapter import failed.');",
		].join('\n'),
	);
	const fixture = resolve('tests', 'fixtures', 'scenes', 'minimal-valid.json');
	execFileSync(process.execPath, [join(consumer, 'smoke.mjs'), fixture], {
		cwd: consumer,
		stdio: 'inherit',
	});
	const cli = join(consumer, 'node_modules', '.bin', 'baron-kline');
	const html = join(consumer, 'scene.html');
	execFileSync(cli, ['validate', fixture], { cwd: consumer, stdio: 'inherit' });
	execFileSync(
		cli,
		['render', fixture, '--format', 'html', '--output', html],
		{ cwd: consumer, stdio: 'inherit' },
	);
	assert.match(await readFile(html, 'utf8'), /__BARON_KLINE_SCENE__/);
});
