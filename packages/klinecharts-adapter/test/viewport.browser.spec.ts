import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');

test('@browser applies the controlled initial viewport', async ({ page }) => {
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
	}, minimalScene);

	expect(snapshot.barSpace).toBe(minimalScene.viewport.barSpace);
	expect(snapshot.rightOffsetDistance).toBe(minimalScene.viewport.rightOffsetDistance);
});
