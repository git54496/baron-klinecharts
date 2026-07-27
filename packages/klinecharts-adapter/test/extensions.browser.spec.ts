import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allOverlays = loadScene('all-overlays.json');

test('@browser registers and creates every project Overlay extension', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const extensionIds = await page.evaluate(async (scene) => {
		const {
			areProjectOverlaysRegistered,
			KLineChartsSceneAdapter,
			PROJECT_OVERLAYS,
		} = await import('/src/index.ts');
		const adapter = await KLineChartsSceneAdapter.create(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const ids = adapter
			.listOverlays()
			.filter((overlay) => PROJECT_OVERLAYS.includes(overlay.type))
			.map((overlay) => overlay.id);
		const registered = areProjectOverlaysRegistered();
		adapter.dispose();
		return { ids, registered };
	}, allOverlays);

	expect(extensionIds.registered).toBe(true);
	expect(extensionIds.ids).toHaveLength(5);
});
