import { expect, test } from '@playwright/test';

import { loadScene } from './helpers.js';

test('100 Runtime and toolbar lifecycles leave no DOM, listener, editor, or object URL', async ({ page }) => {
	await page.goto('/packages/web-runtime/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
		} = await import('/packages/web-runtime/src/index.ts');
		const createdUrls = new Set<string>();
		const originalCreate = URL.createObjectURL.bind(URL);
		const originalRevoke = URL.revokeObjectURL.bind(URL);
		URL.createObjectURL = (value) => {
			const url = originalCreate(value);
			createdUrls.add(url);
			return url;
		};
		URL.revokeObjectURL = (url) => {
			createdUrls.delete(url);
			originalRevoke(url);
		};
		let eventCount = 0;
		for (let index = 0; index < 100; index++) {
			const chart = document.querySelector<HTMLElement>('#chart')!;
			const toolbarRoot = document.querySelector<HTMLElement>('#toolbar')!;
			const runtime = await createKLineSceneRuntime(
				chart,
				scene,
				{ onEvent: () => eventCount++ },
			);
			const toolbar = createStandardToolbar(toolbarRoot, runtime);
			toolbar.element.querySelector<HTMLButtonElement>('[data-action="export"]')!.click();
			toolbar.destroy();
			runtime.destroy();
		}
		URL.createObjectURL = originalCreate;
		URL.revokeObjectURL = originalRevoke;
		return {
			chartChildren: document.querySelector('#chart')!.childElementCount,
			toolbarChildren: document.querySelector('#toolbar')!.childElementCount,
			editors: document.querySelectorAll('[data-action="overlay-text"]').length,
			tooltips: document.querySelectorAll('.baron-kline-toolbar-tooltip').length,
			objectUrls: createdUrls.size,
			eventCount,
		};
	}, await loadScene('minimal-valid.json'));

	expect(result).toEqual({
		chartChildren: 0,
		toolbarChildren: 0,
		editors: 0,
		tooltips: 0,
		objectUrls: 0,
		eventCount: 100,
	});
});
