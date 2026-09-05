import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allIndicators = loadScene('all-indicators.json');

test('@browser creates all 27 allowlisted Indicators with Scene IDs', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const snapshot = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const adapter = await KLineChartsSceneAdapter.create(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const result = adapter.inspect();
		adapter.dispose();
		return result;
	}, allIndicators);

	const expected = allIndicators.panes[1]!.indicators.map(({ id, name, paneId, yAxisId }) => ({
		id,
		name,
		paneId,
		yAxisId,
	}));
	expect(snapshot.indicators).toEqual(expected);
	expect(JSON.stringify(snapshot)).not.toContain('baron_pane_');
	expect(JSON.stringify(snapshot)).not.toContain('baron_y_');
});

test('@browser creates indicators attached to the candle pane', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const scene = structuredClone(allIndicators);
	const indicator = scene.panes[1]!.indicators.shift()!;
	indicator.paneId = scene.panes[0]!.id;
	indicator.yAxisId = scene.panes[0]!.yAxes[0]!.id;
	scene.panes[0]!.indicators.push(indicator);

	const snapshot = await page.evaluate(async (value) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const adapter = await KLineChartsSceneAdapter.create(
			document.querySelector<HTMLElement>('#chart')!,
			value,
		);
		const result = adapter.inspect();
		adapter.dispose();
		return result;
	}, scene);

	expect(snapshot.indicators).toContainEqual({
		id: indicator.id,
		name: indicator.name,
		paneId: scene.panes[0]!.id,
		yAxisId: scene.panes[0]!.yAxes[0]!.id,
	});
});

test('@browser replaces candle-pane indicators without rebuilding the chart', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const scene = structuredClone(allIndicators);
	const indicator = scene.panes[1]!.indicators.shift()!;
	indicator.paneId = scene.panes[0]!.id;
	indicator.yAxisId = scene.panes[0]!.yAxes[0]!.id;
	scene.panes[0]!.indicators.push(indicator);

	const result = await page.evaluate(async ({ initial, indicatorId }) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const adapter = await KLineChartsSceneAdapter.create(container, initial);
		const chartRoot = container.firstElementChild;
		const withoutMain = structuredClone(initial);
		withoutMain.panes[0]!.indicators = [];
		adapter.replaceScene(withoutMain);
		const afterRemove = adapter.inspect().indicators.some(
			(candidate) => candidate.id === indicatorId,
		);
		adapter.replaceScene(initial);
		const afterRestore = adapter.inspect().indicators.some(
			(candidate) => candidate.id === indicatorId,
		);
		const sameChartRoot = container.firstElementChild === chartRoot;
		adapter.dispose();
		return { afterRemove, afterRestore, sameChartRoot };
	}, { initial: scene, indicatorId: indicator.id });

	expect(result).toEqual({
		afterRemove: false,
		afterRestore: true,
		sameChartRoot: true,
	});
});
