import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allOverlays = loadScene('all-overlays.json');

test('@browser round-trips all 21 registered Overlay types', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const exported = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const adapter = await KLineChartsSceneAdapter.create(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const value = adapter.exportScene();
		adapter.dispose();
		return value;
	}, allOverlays);

	expect(exported.overlays).toEqual(allOverlays.overlays);
	expect(JSON.stringify(exported)).not.toContain('candle_pane');
});
