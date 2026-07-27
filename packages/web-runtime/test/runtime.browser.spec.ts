import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');
const allOverlays = loadScene('all-overlays.json');

test('@browser Runtime owns overlay CRUD, clone boundaries, and pure-data events', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async ({ scene, overlay }) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: unknown[] = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		const added = runtime.addOverlay(overlay);
		added.visible = false;
		const afterCallerMutation = runtime.getOverlay(overlay.id)!.visible;
		const updated = runtime.updateOverlay({ ...overlay, visible: false });
		const removed = runtime.removeOverlay(overlay.id);
		const finalCount = runtime.listOverlays().length;
		const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(runtime));
		runtime.destroy();
		return {
			afterCallerMutation,
			updatedVisible: updated.visible,
			removed,
			finalCount,
			methodNames,
			events,
		};
	}, { scene: minimalScene, overlay: allOverlays.overlays[7] });

	expect(result.afterCallerMutation).toBe(true);
	expect(result.updatedVisible).toBe(false);
	expect(result.removed).toBe(true);
	expect(result.finalCount).toBe(0);
	expect(result.methodNames).not.toEqual(
		expect.arrayContaining(['getChart', 'getEngine', 'undo', 'redo']),
	);
	expect(result.events.map((event) => (event as { type: string }).type)).toEqual([
		'scene-ready',
		'overlay-created',
		'overlay-updated',
		'overlay-removed',
	]);
	expect(JSON.stringify(result.events)).not.toMatch(/createPointFigures|extendData|function/);
});

test('@browser starts drawing with a deterministic stable ID without persisting partial geometry', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const id = runtime.startOverlayDrawing('segment');
		const overlays = runtime.listOverlays();
		runtime.destroy();
		return { id, count: overlays.length };
	}, minimalScene);

	expect(result).toEqual({ id: 'overlay-segment-0', count: 0 });
});

test('@browser commits completed drawing geometry and emits overlay-created', async ({ page }) => {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
			consoleErrors.push(message.text());
		}
	});
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: unknown[] = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		runtime.subscribe((event) => events.push(event));
		runtime.startOverlayDrawing('segment');
		Object.assign(window, { __baronRuntime: runtime, __baronEvents: events });
	}, minimalScene);

	const overlayCanvas = page.locator('#chart canvas').nth(1);
	await expect(overlayCanvas).toBeVisible();
	await overlayCanvas.click();
	await page.waitForTimeout(350);
	await overlayCanvas.click();

	await page.waitForTimeout(100);
	const drawingState = await page.evaluate(() => {
		const state = window as unknown as {
			__baronRuntime: { listOverlays(): readonly unknown[] };
			__baronEvents: unknown[];
		};
		return {
			count: state.__baronRuntime.listOverlays().length,
			events: state.__baronEvents,
		};
	});
	expect(drawingState.count).toBe(1);
	expect(drawingState.events).toEqual(
		expect.arrayContaining([expect.objectContaining({ type: 'overlay-created' })]),
	);
	expect(pageErrors).toEqual([]);
	expect(consoleErrors).toEqual([]);
	const result = await page.evaluate(() => {
		const state = window as unknown as {
			__baronRuntime: {
				exportScene(): { overlays: Array<{ id: string; points?: unknown[] }> };
				destroy(): void;
			};
			__baronEvents: unknown[];
		};
		const overlay = state.__baronRuntime.exportScene().overlays[0]!;
		state.__baronRuntime.destroy();
		return { overlay, events: state.__baronEvents };
	});

	expect(result.overlay.id).toBe('overlay-segment-0');
	expect(result.overlay.points).toHaveLength(2);
	expect(result.events).toEqual(
		expect.arrayContaining([expect.objectContaining({ type: 'overlay-created' })]),
	);
});
