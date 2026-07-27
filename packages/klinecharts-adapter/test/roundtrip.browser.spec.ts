import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allOverlays = loadScene('all-overlays.json');

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
