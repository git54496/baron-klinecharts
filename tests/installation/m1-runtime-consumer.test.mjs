import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
	access,
	copyFile,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { test } from 'node:test';

import { chromium } from '@playwright/test';

import { packPublicPackages, runNpm } from './helpers/pack.mjs';

const publicPackages = [
	'@baron1996/kline-scene-schema',
	'@baron1996/klinecharts-adapter',
	'@baron1996/klinecharts-runtime',
	'@baron1996/klinecharts-cli',
];

const publicPackageVersions = new Map([
	['@baron1996/kline-scene-schema', '0.9.7'],
	['@baron1996/klinecharts-adapter', '0.9.7'],
	['@baron1996/klinecharts-runtime', '0.9.7'],
	['@baron1996/klinecharts-cli', '0.9.7'],
]);

async function loadConsumerPackages() {
	const artifactDirectory = process.env.BARON_NPM_RELEASE_CANDIDATE_DIR;
	if (artifactDirectory === undefined) {
		return packPublicPackages();
	}

	const absoluteArtifactDirectory = resolve(artifactDirectory);
	const artifactManifest = JSON.parse(
		await readFile(
			join(absoluteArtifactDirectory, 'npm-artifacts.json'),
			'utf8',
		),
	);
	assert.deepEqual(
		artifactManifest.packages.map((entry) => entry.name),
		publicPackages,
	);
	const packages = artifactManifest.packages.map((entry) => {
		assert.equal(entry.version, publicPackageVersions.get(entry.name));
		assert.equal(basename(entry.filename), entry.filename);
		return {
			...entry,
			tarball: join(absoluteArtifactDirectory, entry.filename),
		};
	});
	for (const packed of packages) {
		await access(packed.tarball);
	}

	return {
		directory: await mkdtemp(join(tmpdir(), 'baron-m1-release-consumer-')),
		packages,
	};
}

async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function contentType(path) {
	switch (extname(path)) {
		case '.css':
			return 'text/css; charset=utf-8';
		case '.html':
			return 'text/html; charset=utf-8';
		case '.js':
			return 'text/javascript; charset=utf-8';
		default:
			return 'application/octet-stream';
	}
}

async function serveDirectory(directory) {
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');
		const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
		if (pathname.includes('..')) {
			response.writeHead(400);
			response.end();
			return;
		}
		try {
			const bytes = await readFile(join(directory, pathname));
			response.writeHead(200, { 'content-type': contentType(pathname) });
			response.end(bytes);
		} catch {
			response.writeHead(404);
			response.end();
		}
	});
	await new Promise((resolveListen, rejectListen) => {
		server.once('error', rejectListen);
		server.listen(0, '127.0.0.1', resolveListen);
	});
	const address = server.address();
	assert.ok(address !== null && typeof address === 'object');
	return {
		close: () => new Promise((resolveClose, rejectClose) => {
			server.close((error) => {
				if (error === undefined) {
					resolveClose();
				} else {
					rejectClose(error);
				}
			});
		}),
		url: `http://127.0.0.1:${address.port}`,
	};
}

test('runtime README documents the minimum M1 create, draw, export, and recreate journey', async () => {
	const readme = await readFile(
		resolve('packages', 'web-runtime', 'README.md'),
		'utf8',
	);
	for (const publicApi of [
		'parseChartScene',
		'createKLineSceneRuntime',
		"startOverlayDrawing('horizontalStraightLine'",
		'exportScene()',
		'JSON.stringify',
	]) {
		assert.match(readme, new RegExp(publicApi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}
	assert.doesNotMatch(readme, /fetch\s*\(/);
	assert.doesNotMatch(readme, /(?:确认|价位|结构|信号|规则)/);
	assert.doesNotMatch(
		readme,
		/(?:packages\/.+\/src|file:|workspace:|git\+|[/\\](?:Users|var|tmp)[/\\])/,
	);
});

test('four public tarballs support the M1 and M2 Runtime journeys through package exports', async () => {
	const { directory, packages } = await loadConsumerPackages();
	assert.equal(packages.length, publicPackages.length);

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
		assert.equal(await pathExists(lockfile), false);
	}
	for (const packageName of publicPackages) {
		const installedDirectory = join(consumer, 'node_modules', packageName);
		assert.equal((await lstat(installedDirectory)).isSymbolicLink(), false);
		const installedManifest = JSON.parse(
			await readFile(
				join(installedDirectory, 'package.json'),
				'utf8',
			),
		);
		assert.equal(
			installedManifest.version,
			publicPackageVersions.get(packageName),
		);
		if (packageName === '@baron1996/klinecharts-runtime') {
			assert.equal(
				installedManifest.dependencies['@baron1996/klinecharts-adapter'],
				'0.9.7',
			);
		}
		for (const dependencySpec of Object.values(installedManifest.dependencies ?? {})) {
			assert.doesNotMatch(
				dependencySpec,
				/(?:file:|workspace:|git\+|[/\\](?:Users|var|tmp)[/\\])/,
			);
		}
	}

	const publicDirectory = join(consumer, 'public');
	await mkdir(publicDirectory);
	const fixture = join(publicDirectory, 'm1-scene.json');
	await copyFile(
		resolve('tests', 'fixtures', 'scenes', 'm1-candle-horizontal-line.json'),
		fixture,
	);
	await copyFile(
		resolve('tests', 'fixtures', 'scenes', 'm2-measurement-linear.json'),
		join(publicDirectory, 'm2-scene.json'),
	);
	await copyFile(
		resolve('tests', 'fixtures', 'time-series', 'minimal-valid.json'),
		join(publicDirectory, 'time-series-scene.json'),
	);
	const cli = join(installPrefix, 'bin', 'baron-kline');
	execFileSync(cli, ['validate', fixture], { cwd: consumer, stdio: 'inherit' });

	const boundaryProbe = join(consumer, 'boundary-probe.mjs');
	await writeFile(
		boundaryProbe,
		[
			"const schema = await import('@baron1996/kline-scene-schema');",
			"const adapter = await import('@baron1996/klinecharts-adapter');",
			"const runtime = await import('@baron1996/klinecharts-runtime');",
			"if (schema.SCENE_PACKAGE_VERSION !== '0.9.7') throw new Error('Schema root export failed.');",
			"if (adapter.ADAPTER_PACKAGE_VERSION !== '0.9.7') throw new Error('Adapter root export failed.');",
			"if (runtime.WEB_RUNTIME_PACKAGE_VERSION !== '0.9.7') throw new Error('Runtime root export failed.');",
			'const adapterMethods = Object.getOwnPropertyNames(adapter.KLineChartsSceneAdapter.prototype);',
			"if (adapterMethods.includes('getChart') || adapterMethods.includes('getEngine')) throw new Error('Adapter exposes its internal Chart.');",
			'const timeSeriesAdapterMethods = Object.getOwnPropertyNames(adapter.TimeSeriesChartsAdapter.prototype);',
			"if (timeSeriesAdapterMethods.includes('inspect')) throw new Error('Time Series Adapter exposes its inspection state.');",
			"if ('TIME_SERIES_INDICATOR_NAME' in adapter || 'timeSeriesIndicatorTemplate' in adapter) throw new Error('Time Series indicator internals are public.');",
			'for (const specifier of [',
			"  '@baron1996/klinecharts-adapter/src/adapter.js',",
			"  '@baron1996/klinecharts-runtime/src/runtime.js',",
			"  '@baron1996/klinecharts-render-runtime',",
			']) {',
			'  try {',
			'    await import(specifier);',
			"    throw new Error(`Private import unexpectedly resolved: ${specifier}`);",
			'  } catch (error) {',
			"    if (!['ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_MODULE_NOT_FOUND'].includes(error.code)) throw error;",
			'  }',
			'}',
		].join('\n'),
	);
	execFileSync(process.execPath, [boundaryProbe], {
		cwd: consumer,
		stdio: 'inherit',
	});

	const sourceDirectory = join(consumer, 'src');
	await mkdir(sourceDirectory);
	const consumerSource = [
		"import { parseChartScene, parseTimeSeriesScene } from '@baron1996/kline-scene-schema';",
		"import { ADAPTER_PACKAGE_VERSION } from '@baron1996/klinecharts-adapter';",
		"import { createKLineSceneRuntime, createTimeSeriesRuntime } from '@baron1996/klinecharts-runtime';",
		'',
		"const scene = parseChartScene(await (await fetch('/m1-scene.json')).json());",
		'const sourceOverlay = scene.overlays[0];',
		'const events = [];',
		'const container = document.querySelector("#chart");',
		'const runtime = await createKLineSceneRuntime(container, scene, {',
		'  onEvent: (event) => events.push(event),',
		'});',
		"const startedId = runtime.startOverlayDrawing('horizontalStraightLine', {",
		"  id: 'overlay-m1-consumer-horizontal',",
		'  paneId: sourceOverlay.paneId,',
		'  styles: sourceOverlay.styles,',
		'  metadata: sourceOverlay.metadata,',
		'});',
		'window.__M1_CONSUMER__ = { adapterVersion: ADAPTER_PACKAGE_VERSION, events, startedId };',
		'window.__COMPLETE_M1_ROUND_TRIP__ = async () => {',
		'  const firstScene = runtime.exportScene();',
		'  const firstOverlay = runtime.getOverlay(startedId);',
		'  const serialized = JSON.stringify(firstScene);',
		'  runtime.destroy();',
		'  const childrenAfterDestroy = container.childElementCount;',
		'  const recreated = await createKLineSceneRuntime(container, JSON.parse(serialized));',
		'  const secondScene = recreated.exportScene();',
		'  const secondOverlay = recreated.getOverlay(startedId);',
		'  const result = {',
		'    childrenAfterDestroy,',
		'    firstOverlay,',
		'    firstOverlayIds: firstScene.overlays.map((overlay) => overlay.id),',
		'    methodNames: Object.getOwnPropertyNames(Object.getPrototypeOf(recreated)),',
		'    secondOverlay,',
		'    secondOverlayIds: secondScene.overlays.map((overlay) => overlay.id),',
		'  };',
		'  recreated.destroy();',
		'  window.__M1_RESULT__ = result;',
		'  return result;',
		'};',
		'window.__COMPLETE_M2_ROUND_TRIP__ = async () => {',
		"  const m2Scene = parseChartScene(await (await fetch('/m2-scene.json')).json());",
		'  const m2Runtime = await createKLineSceneRuntime(container, m2Scene);',
		"  const source = m2Scene.overlays.find((overlay) => overlay.type === 'priceMeasurement');",
		"  const created = m2Runtime.addOverlay({ ...source, id: 'm2-consumer-measurement' });",
		"  const styled = m2Runtime.updateOverlayStyles(created.id, { ...created.styles, line: { ...created.styles.line, color: 'rgba(255, 0, 0, 1)' } });",
		'  const beforeValues = m2Runtime.listOverlays().map((overlay) => ({ id: overlay.id, anchor: overlay.anchor, start: overlay.start, end: overlay.end }));',
		"  const logarithmic = await m2Runtime.setPriceScale('logarithmic');",
		'  const serialized = JSON.stringify(m2Runtime.exportScene());',
		'  m2Runtime.destroy();',
		'  const childrenAfterDestroy = container.childElementCount;',
		'  const recreated = await createKLineSceneRuntime(container, JSON.parse(serialized));',
		'  const afterValues = recreated.listOverlays().map((overlay) => ({ id: overlay.id, anchor: overlay.anchor, start: overlay.start, end: overlay.end }));',
		"  const recreatedOverlay = recreated.getOverlay('m2-consumer-measurement');",
		"  const removed = recreated.removeOverlay('m2-consumer-measurement');",
		'  const remainingCount = recreated.listOverlays().length;',
		'  recreated.destroy();',
		'  return { afterValues, beforeValues, childrenAfterDestroy, logarithmic, recreatedOverlay, remainingCount, removed, styled };',
		'};',
		'window.__COMPLETE_TIME_SERIES_ROUND_TRIP__ = async () => {',
		"  const source = parseTimeSeriesScene(await (await fetch('/time-series-scene.json')).json());",
		'  const timeSeriesRuntime = await createTimeSeriesRuntime(container, source);',
		"  const visibility = timeSeriesRuntime.setSeriesVisible('series-b', false);",
		'  const replacement = await timeSeriesRuntime.replaceData([',
		"    { timestamp: 1767484800000, values: { 'series-a': 30, 'series-b': 40, 'series-total': 70 } },",
		"    { timestamp: 1767571200000, values: { 'series-a': 31, 'series-b': null, 'series-total': 31 } },",
		'  ]);',
		'  const exported = timeSeriesRuntime.exportScene();',
		'  const serialized = JSON.stringify(exported);',
		'  timeSeriesRuntime.destroy();',
		'  const childrenAfterDestroy = container.childElementCount;',
		'  const recreated = await createTimeSeriesRuntime(container, JSON.parse(serialized));',
		'  const recreatedScene = recreated.exportScene();',
		'  recreated.destroy();',
		'  return { childrenAfterDestroy, exported, recreatedScene, replacement, visibility };',
		'};',
	].join('\n');
	assert.doesNotMatch(
		consumerSource,
		/(?:packages\/.+\/src|klinecharts-render-runtime|file:|workspace:|git\+)/,
	);
	await writeFile(join(sourceDirectory, 'main.js'), consumerSource);
	await writeFile(
		join(consumer, 'index.html'),
		[
			'<!doctype html>',
			'<meta charset="utf-8">',
			'<style>html,body,#chart{width:100%;height:100%;margin:0}#chart{min-height:600px}</style>',
			'<div id="chart"></div>',
			'<script type="module" src="/src/main.js"></script>',
		].join('\n'),
	);

	const outputDirectory = join(directory, 'browser-bundle');
	execFileSync(
		resolve('node_modules', '.bin', 'vite'),
		['build', '.', '--outDir', outputDirectory, '--emptyOutDir'],
		{ cwd: consumer, stdio: 'inherit' },
	);

	const server = await serveDirectory(outputDirectory);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
		await page.goto(server.url);
		await page.waitForFunction(() => window.__M1_CONSUMER__?.startedId !== undefined);
		const readiness = await page.evaluate(() => window.__M1_CONSUMER__);
		assert.equal(readiness.adapterVersion, '0.9.7');
		assert.equal(readiness.startedId, 'overlay-m1-consumer-horizontal');

		const drawingCanvas = page.locator('#chart canvas').nth(1);
		await drawingCanvas.waitFor({ state: 'visible' });
		await drawingCanvas.click({ position: { x: 500, y: 170 } });
		await page.waitForFunction(() =>
			window.__M1_CONSUMER__.events
				.filter((event) => event.type === 'overlay-created').length === 1
		);

		const result = await page.evaluate(() => window.__COMPLETE_M1_ROUND_TRIP__());
		assert.equal(result.childrenAfterDestroy, 0);
		assert.deepEqual(
			result.firstOverlayIds,
			[
				'overlay-m1-horizontal-reference',
				'overlay-m1-consumer-horizontal',
			],
		);
		assert.deepEqual(result.secondOverlayIds, result.firstOverlayIds);
		assert.deepEqual(result.secondOverlay, result.firstOverlay);
		assert.equal(result.firstOverlay.type, 'horizontalStraightLine');
		assert.deepEqual(Object.keys(result.firstOverlay.anchor), ['value']);
		assert.ok(Number.isFinite(result.firstOverlay.anchor.value));
		assert.match(
			String(result.firstOverlay.anchor.value),
			/^-?\d+(?:\.\d{1,2})?$/u,
		);
		assert.ok(!result.methodNames.includes('getChart'));
		assert.ok(!result.methodNames.includes('getEngine'));

		const m2Result = await page.evaluate(() => window.__COMPLETE_M2_ROUND_TRIP__());
		assert.equal(m2Result.logarithmic.runtime.runtimeVersion, '0.2.0');
		assert.equal(m2Result.logarithmic.panes[0].yAxes[0].scale, 'logarithmic');
		assert.equal(m2Result.styled.styles.line.color, 'rgba(255, 0, 0, 1)');
		assert.equal(m2Result.recreatedOverlay.styles.line.color, 'rgba(255, 0, 0, 1)');
		assert.deepEqual(m2Result.afterValues, m2Result.beforeValues);
		assert.equal(m2Result.childrenAfterDestroy, 0);
		assert.equal(m2Result.removed, true);
		assert.equal(m2Result.remainingCount, 3);

		const timeSeriesResult = await page.evaluate(
			() => window.__COMPLETE_TIME_SERIES_ROUND_TRIP__(),
		);
		assert.equal(timeSeriesResult.visibility.series[1].visible, false);
		assert.equal(timeSeriesResult.replacement.data.length, 2);
		assert.equal(timeSeriesResult.exported.viewport.anchorTimestamp, 1767571200000);
		assert.deepEqual(timeSeriesResult.recreatedScene, timeSeriesResult.exported);
		assert.equal(timeSeriesResult.childrenAfterDestroy, 0);
	} finally {
		await browser.close();
		await server.close();
	}
});
