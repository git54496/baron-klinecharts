import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');

test('@browser toolbar uses registered tools and DOM APIs with explicit teardown', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
			SUPPORTED_OVERLAYS,
		} = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const calls: string[] = [];
		const originalStart = runtime.startOverlayDrawing.bind(runtime);
		runtime.startOverlayDrawing = ((type: string) => {
			calls.push(type);
			return `test-${type}`;
		}) as typeof runtime.startOverlayDrawing;
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
		);
		const buttons = [...toolbar.element.querySelectorAll<HTMLButtonElement>('[data-overlay-type]')];
		buttons[0]!.click();
		const types = buttons.map((button) => button.dataset.overlayType);
		void originalStart;
		runtime.destroy();
		return {
			expected: [...SUPPORTED_OVERLAYS],
			types,
			calls,
			remaining: document.querySelector('#toolbar')!.childElementCount,
		};
	}, minimalScene);

	expect(result.types).toEqual(result.expected);
	expect(result.calls).toEqual([result.expected[0]]);
	expect(result.remaining).toBe(0);
});

test('@browser toolbar deletes only an unlocked selected Overlay and revokes export URLs', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
			DEFAULT_OVERLAY_STYLES,
		} = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const removed: string[] = [];
		const urls: string[] = [];
		runtime.getSelectedOverlayId = () => 'overlay-selected';
		runtime.getOverlay = () => ({
			id: 'overlay-selected',
			type: 'segment',
			paneId: 'pane-candle',
			visible: true,
			locked: false,
			zLevel: 0,
			mode: 'normal',
			styles: DEFAULT_OVERLAY_STYLES,
			points: [
				{ timestamp: 1784736000000, value: 12.4 },
				{ timestamp: 1784822400000, value: 12.7 },
			],
		});
		runtime.removeOverlay = ((id: string) => {
			removed.push(id);
			return true;
		}) as typeof runtime.removeOverlay;
		URL.createObjectURL = () => {
			urls.push('created');
			return 'blob:test';
		};
		URL.revokeObjectURL = () => {
			urls.push('revoked');
		};
		HTMLAnchorElement.prototype.click = () => {
			urls.push('clicked');
		};
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
		);
		toolbar.element.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
		toolbar.element.querySelector<HTMLButtonElement>('[data-action="export"]')!.click();
		runtime.destroy();
		return { removed, urls };
	}, minimalScene);

	expect(result.removed).toEqual(['overlay-selected']);
	expect(result.urls).toEqual(['created', 'clicked', 'revoked']);
});
