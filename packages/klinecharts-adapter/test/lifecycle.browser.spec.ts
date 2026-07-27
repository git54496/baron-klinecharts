import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');

test('@browser atomically rejects an invalid scene before DOM creation', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (source) => {
		const scene = structuredClone(source) as Record<string, unknown>;
		const overlays = scene.overlays as Array<Record<string, unknown>>;
		overlays.push({
			id: 'overlay-invalid',
			type: 'unsupportedOverlay',
			paneId: 'pane-candle',
			visible: true,
			locked: false,
			zLevel: 0,
			mode: 'normal',
			styles: {},
		});
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		let code = '';
		try {
			await KLineChartsSceneAdapter.create(container, scene);
		} catch (error) {
			code = (error as { code?: string }).code ?? '';
		}
		return { code, children: container.childElementCount };
	}, minimalScene);

	expect(result).toEqual({ code: 'UNKNOWN_OVERLAY', children: 0 });
});

test('@browser completes 100 create/dispose cycles without retained DOM', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const initial = container.childElementCount;
		for (let index = 0; index < 100; index++) {
			const adapter = await KLineChartsSceneAdapter.create(container, scene);
			adapter.dispose();
		}
		return { initial, final: container.childElementCount };
	}, minimalScene);

	expect(result.final).toBe(result.initial);
});
