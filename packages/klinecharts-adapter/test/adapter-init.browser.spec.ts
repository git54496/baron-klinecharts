import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');

test.describe('@browser Adapter initialization', () => {
	test('loads only embedded static bars and disposes exactly once', async ({ page }) => {
		await page.goto('/test/fixture.html');
		const result = await page.evaluate(async (scene) => {
			const networkCalls: string[] = [];
			const nativeFetch = window.fetch;
			window.fetch = (...args) => {
				networkCalls.push(String(args[0]));
				return nativeFetch(...args);
			};
			const { KLineChartsSceneAdapter } = await import('/src/index.ts');
			const container = document.querySelector<HTMLElement>('#chart')!;
			container.style.backgroundColor = 'rgb(1, 2, 3)';
			const adapter = await KLineChartsSceneAdapter.create(container, scene);
			const snapshot = adapter.inspect();
			const childCount = container.childElementCount;
			const engineRootTouchAction = getComputedStyle(
				container.firstElementChild!,
			).touchAction;
			adapter.dispose();
			adapter.dispose();
			return {
				snapshot,
				childCount,
				engineRootTouchAction,
				afterDispose: container.childElementCount,
				background: container.style.backgroundColor,
				networkCalls,
			};
		}, minimalScene);

		expect(result.snapshot.engineVersion).toBe('10.0.0');
		expect(result.snapshot.dataCount).toBe(minimalScene.data.length);
		expect(result.childCount).toBeGreaterThan(0);
		expect(result.engineRootTouchAction).toBe('none');
		expect(result.afterDispose).toBe(0);
		expect(result.background).toBe('rgb(1, 2, 3)');
		expect(result.networkCalls).toEqual([]);
	});
});
