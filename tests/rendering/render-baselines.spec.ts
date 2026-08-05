import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import {
	renderDrawableWorkspacePng,
	renderScenePng,
} from '@baron1996/klinecharts-render-runtime';

import { loadScene } from '../browser/helpers.js';

const cases = [
	['minimal', 'minimal-valid.json'],
	['all-indicators', 'all-indicators.json'],
	['all-overlays', 'all-overlays.json'],
] as const;

function baselinePath(name: string): string {
	const variant = process.env.BARON_PNG_BASELINE?.trim();
	return resolve(
		'tests',
		'rendering',
		'baselines',
		...(variant === undefined || variant === '' ? [] : [variant]),
		name,
	);
}

for (const [baseline, fixture] of cases) {
	test(`render baseline: ${baseline}`, async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-render-baseline-'));
		const output = join(directory, `${baseline}.png`);
		await renderScenePng(await loadScene(fixture), output);
		expect(await readFile(output)).toEqual(
			await readFile(baselinePath(`${baseline}.png`)),
		);
	});
}

test('render baseline: controlled dark style', async () => {
	const scene = await loadScene('minimal-valid.json');
	scene.chart.layout.backgroundColor = 'rgba(18, 18, 18, 1)';
	scene.chart.layout.textColor = 'rgba(238, 238, 238, 1)';
	scene.chart.grid.horizontalColor = 'rgba(55, 55, 55, 1)';
	scene.chart.grid.verticalColor = 'rgba(55, 55, 55, 1)';
	scene.render.background = 'rgba(18, 18, 18, 1)';
	const directory = await mkdtemp(join(tmpdir(), 'baron-render-baseline-'));
	const output = join(directory, 'minimal-dark.png');
	await renderScenePng(scene, output);
	expect(await readFile(output)).toEqual(
		await readFile(baselinePath('minimal-dark.png')),
	);
});

for (const [baseline, fixture] of [
	['drawable-workspace-chart', 'workspaces/chart-minimal.json'],
	['drawable-workspace-area', 'workspaces/chart-minimal.json'],
] as const) {
	test(`render baseline: ${baseline}`, async () => {
		const workspace = JSON.parse(
			await readFile(resolve('tests', 'fixtures', fixture), 'utf8'),
		) as {
			scene: { document: { chart: { candle: Record<string, unknown> } } };
		};
		if (baseline === 'drawable-workspace-area') {
			const areaScene = JSON.parse(
				await readFile(
					resolve('tests', 'fixtures', 'scenes', 'chart-area-close-line.json'),
					'utf8',
				),
			) as { chart: { candle: Record<string, unknown> } };
			workspace.scene.document.chart.candle = areaScene.chart.candle;
		}
		const directory = await mkdtemp(join(tmpdir(), 'baron-workspace-baseline-'));
		const output = join(directory, `${baseline}.png`);
		await renderDrawableWorkspacePng(workspace, output);
		expect(await readFile(output)).toEqual(
			await readFile(baselinePath(`${baseline}.png`)),
		);
	});
}
