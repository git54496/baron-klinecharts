import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { renderScenePng } from '@baron1996/klinecharts-render-runtime';

import { loadScene } from '../browser/helpers.js';

const cases = [
	['minimal', 'minimal-valid.json'],
	['all-indicators', 'all-indicators.json'],
	['all-overlays', 'all-overlays.json'],
] as const;

for (const [baseline, fixture] of cases) {
	test(`render baseline: ${baseline}`, async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-render-baseline-'));
		const output = join(directory, `${baseline}.png`);
		await renderScenePng(await loadScene(fixture), output);
		expect(await readFile(output)).toEqual(
			await readFile(resolve('tests', 'rendering', 'baselines', `${baseline}.png`)),
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
		await readFile(resolve('tests', 'rendering', 'baselines', 'minimal-dark.png')),
	);
});
