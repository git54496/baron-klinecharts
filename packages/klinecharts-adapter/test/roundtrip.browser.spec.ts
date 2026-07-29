import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allOverlays = loadScene('all-overlays.json');
const m1Scene = loadScene('m1-candle-horizontal-line.json');

test('@browser exports no executable or engine-only Overlay fields', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const serialized = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const adapter = await KLineChartsSceneAdapter.create(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const result = JSON.stringify(adapter.exportScene());
		adapter.dispose();
		return result;
	}, allOverlays);

	expect(serialized).not.toMatch(/createPointFigures|onClick|extendData|function/);
	expect(serialized).not.toMatch(/baron_pane_|baron_y_|candle_pane/);
});

test('@browser preserves one M1 horizontal line across dispose and recreate', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		container.style.backgroundColor = 'rgb(1, 2, 3)';
		const initialChildren = container.childElementCount;

		const firstAdapter = await KLineChartsSceneAdapter.create(container, scene);
		const firstActiveChildren = container.childElementCount;
		const firstExport = firstAdapter.exportScene();
		firstAdapter.dispose();
		const afterFirstDispose = {
			background: container.style.backgroundColor,
			children: container.childElementCount,
		};

		const secondAdapter = await KLineChartsSceneAdapter.create(container, firstExport);
		const secondActiveChildren = container.childElementCount;
		const secondExport = secondAdapter.exportScene();
		secondAdapter.dispose();
		const afterSecondDispose = {
			background: container.style.backgroundColor,
			children: container.childElementCount,
		};

		return {
			afterFirstDispose,
			afterSecondDispose,
			firstActiveChildren,
			firstExport,
			initialChildren,
			secondActiveChildren,
			secondExport,
		};
	}, m1Scene);

	const expectedOverlay = m1Scene.overlays[0]!;
	expect(result.initialChildren).toBe(0);
	expect(result.firstActiveChildren).toBeGreaterThan(0);
	expect(result.secondActiveChildren).toBeGreaterThan(0);
	expect(result.afterFirstDispose).toEqual({
		background: 'rgb(1, 2, 3)',
		children: 0,
	});
	expect(result.afterSecondDispose).toEqual(result.afterFirstDispose);
	expect(result.firstExport.overlays).toHaveLength(1);
	expect(result.secondExport.overlays).toHaveLength(1);
	expect(result.firstExport.overlays[0]).toEqual(expectedOverlay);
	expect(result.secondExport.overlays[0]).toEqual(result.firstExport.overlays[0]);
	expect(result.secondExport.overlays[0]!.id).toBe(expectedOverlay.id);
	expect(result.secondExport.overlays[0]!.anchor).toEqual(expectedOverlay.anchor);
	expect(result.secondExport.overlays[0]!.styles).toEqual(expectedOverlay.styles);
	expect(result.secondExport.overlays[0]!.metadata).toEqual(expectedOverlay.metadata);
});
