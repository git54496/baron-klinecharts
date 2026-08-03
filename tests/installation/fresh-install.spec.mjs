import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { packPublicPackages, runNpm } from './helpers/pack.mjs';

test('packed npm artifacts install and run without workspace links', async () => {
	const { directory, packages } = await packPublicPackages();
	const timeSeriesScene = JSON.parse(
		await readFile(
			resolve('tests', 'fixtures', 'time-series', 'minimal-valid.json'),
			'utf8',
		),
	);
	const installPrefix = join(directory, 'consumer-prefix');
	const consumer = join(installPrefix, 'lib');
	await mkdir(consumer, { recursive: true });
	const manifest = '{"private":true,"type":"module"}\n';
	await writeFile(join(consumer, 'package.json'), manifest);
	runNpm(
		[
			'install',
			'--global',
			'--prefix',
			installPrefix,
			'--ignore-scripts',
			...packages.map((packed) => packed.tarball),
		],
		{ cwd: consumer, stdio: 'inherit' },
	);
	assert.equal(await readFile(join(consumer, 'package.json'), 'utf8'), manifest);
	for (const lockfile of [
		join(installPrefix, 'package-lock.json'),
		join(consumer, 'package-lock.json'),
		join(consumer, 'node_modules', '.package-lock.json'),
	]) {
		await assert.rejects(
			access(lockfile),
			(error) => error?.code === 'ENOENT',
		);
	}
	await writeFile(
		join(consumer, 'smoke.mjs'),
		[
			"import { readFile } from 'node:fs/promises';",
			"import { parseChartScene } from '@baron1996/kline-scene-schema';",
			"import { WEB_RUNTIME_PACKAGE_VERSION } from '@baron1996/klinecharts-runtime';",
			"import { ADAPTER_PACKAGE_VERSION } from '@baron1996/klinecharts-adapter';",
			"const scene = JSON.parse(await readFile(process.argv[2], 'utf8'));",
			"if (parseChartScene(scene).version !== 1) throw new Error('Scene import failed.');",
			"if (WEB_RUNTIME_PACKAGE_VERSION !== '0.3.0') throw new Error('Web Runtime import failed.');",
			"if (ADAPTER_PACKAGE_VERSION !== '0.3.0') throw new Error('Adapter import failed.');",
		].join('\n'),
	);
	const fixture = resolve('tests', 'fixtures', 'scenes', 'minimal-valid.json');
	execFileSync(process.execPath, [join(consumer, 'smoke.mjs'), fixture], {
		cwd: consumer,
		stdio: 'inherit',
	});
	await writeFile(
		join(consumer, 'consumer.ts'),
		[
			"import { parseTimeSeriesScene, type TimeSeriesScene } from '@baron1996/kline-scene-schema';",
			"import { createTimeSeriesRuntime, WEB_RUNTIME_PACKAGE_VERSION } from '@baron1996/klinecharts-runtime';",
			`const rawScene: unknown = ${JSON.stringify(timeSeriesScene)};`,
			'const scene: TimeSeriesScene = parseTimeSeriesScene(rawScene);',
			"if (scene.series.length !== 3) throw new Error('Time Series schema import failed.');",
			"if (scene.series.map(({ id }) => id).join(',') !== 'series-a,series-b,series-total') throw new Error('Time Series order changed.');",
			"if (WEB_RUNTIME_PACKAGE_VERSION !== '0.3.0') throw new Error('Time Series Runtime import failed.');",
			'const runtimeFactory: typeof createTimeSeriesRuntime = createTimeSeriesRuntime;',
			'if (typeof runtimeFactory !== "function") throw new Error("Time Series Runtime factory is missing.");',
		].join('\n'),
	);
	await writeFile(
		join(consumer, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				lib: ['ES2023', 'DOM'],
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				outDir: 'compiled',
				strict: true,
				target: 'ES2023',
			},
			include: ['consumer.ts'],
		}, null, 2),
	);
	execFileSync(
		resolve('node_modules', '.bin', 'tsc'),
		['--project', join(consumer, 'tsconfig.json')],
		{ cwd: consumer, stdio: 'inherit' },
	);
	execFileSync(process.execPath, [join(consumer, 'compiled', 'consumer.js')], {
		cwd: consumer,
		stdio: 'inherit',
	});
	const cli = join(installPrefix, 'bin', 'baron-kline');
	const html = join(consumer, 'scene.html');
	execFileSync(cli, ['validate', fixture], { cwd: consumer, stdio: 'inherit' });
	execFileSync(
		cli,
		['render', fixture, '--format', 'html', '--output', html],
		{ cwd: consumer, stdio: 'inherit' },
	);
	assert.match(await readFile(html, 'utf8'), /__BARON_KLINE_SCENE__/);
});
