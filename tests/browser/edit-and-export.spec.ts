import { expect, test } from '@playwright/test';

import { createSourceRuntime, loadScene } from './helpers.js';

test('desktop mouse creates, selects, drags, updates, and deletes an Overlay', async ({ page }) => {
	await createSourceRuntime(page, await loadScene('minimal-valid.json'));
	await page.locator('[data-overlay-type="segment"]').click();
	const canvas = page.locator('#chart canvas').nth(1);
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	await canvas.click();
	await page.waitForTimeout(350);
	await canvas.click();
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronTestRuntime: { listOverlays(): readonly unknown[] };
		}
	).__baronTestRuntime.listOverlays().length)).toBe(1);

	const allOverlays = await loadScene('all-overlays.json');
	const sourceSegment = allOverlays.overlays.find((overlay) => overlay.type === 'segment')!;
	const projectedSegment = await page.evaluate((points) => {
		const runtime = (
			window as unknown as {
				__baronTestRuntime: {
					getOverlay(id: string): object;
					projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
					updateOverlay(value: object): void;
				};
			}
		).__baronTestRuntime;
		runtime.updateOverlay({
			...runtime.getOverlay('overlay-segment-0'),
			points,
		});
		return points.map((point) => runtime.projectPoint(point));
	}, sourceSegment.points);
	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	const start = {
		x: chartBox!.x + (projectedSegment[0]!.x + projectedSegment[1]!.x) / 2,
		y: chartBox!.y + (projectedSegment[0]!.y + projectedSegment[1]!.y) / 2,
	};
	await page.mouse.click(start.x, start.y);
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronTestRuntime: { getSelectedOverlayId(): string | undefined };
		}
	).__baronTestRuntime.getSelectedOverlayId())).toBe('overlay-segment-0');
	const updatesBeforeDrag = await page.evaluate(() => (
		window as unknown as { __baronTestEvents: Array<{ type: string }> }
	).__baronTestEvents.filter((event) => event.type === 'overlay-updated').length);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.waitForTimeout(100);
	await page.mouse.move(start.x + 40, start.y + 24, { steps: 5 });
	await page.waitForTimeout(100);
	await page.mouse.up();
	await expect.poll(() => page.evaluate(() => (
		window as unknown as { __baronTestEvents: Array<{ type: string }> }
	).__baronTestEvents.filter((event) => event.type === 'overlay-updated').length))
		.toBeGreaterThan(updatesBeforeDrag);

	await page.locator('.baron-drawing-toolbar [data-action="delete"]').click();
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronTestRuntime: { listOverlays(): readonly unknown[] };
		}
	).__baronTestRuntime.listOverlays().length)).toBe(0);
});

test('Chinese text input is persisted and pan/zoom is not persisted', async ({ page }) => {
	const scene = await loadScene('minimal-valid.json');
	await createSourceRuntime(page, scene);
	const originalViewport = structuredClone(scene.viewport);
	await page.locator('[data-action="overlay-text"]').fill('中文标注：突破');
	await page.locator('[data-overlay-type="text"]').click();
	const canvas = page.locator('#chart canvas').nth(1);
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	await page.mouse.click(box!.x + 420, box!.y + 260);
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronTestRuntime: { listOverlays(): readonly unknown[] };
		}
	).__baronTestRuntime.listOverlays().length)).toBe(1);

	await page.mouse.move(box!.x + 700, box!.y + 300);
	await page.mouse.wheel(0, -500);
	await page.mouse.down();
	await page.mouse.move(box!.x + 600, box!.y + 300, { steps: 5 });
	await page.mouse.up();
	const exported = await page.evaluate(() => (
		window as unknown as {
			__baronTestRuntime: {
				exportScene(): { overlays: Array<{ text?: string }>; viewport: unknown };
			};
		}
	).__baronTestRuntime.exportScene());
	expect(exported.overlays[0]?.text).toBe('中文标注：突破');
	expect(exported.viewport).toEqual(originalViewport);
});

test('mobile touch creates an Overlay and no undo/redo surface or hotkey exists', async ({ browser }) => {
	const context = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 1200, height: 800 },
		locale: 'zh-CN',
		timezoneId: 'Asia/Shanghai',
	});
	try {
		const page = await context.newPage();
		await createSourceRuntime(page, await loadScene('minimal-valid.json'));
		expect(await page.locator('[data-action="undo"], [data-action="redo"]').count()).toBe(0);
		const methods = await page.evaluate(() => Object.getOwnPropertyNames(Object.getPrototypeOf(
			(window as unknown as { __baronTestRuntime: object }).__baronTestRuntime,
		)));
		expect(methods).not.toEqual(expect.arrayContaining(['undo', 'redo']));
		await page.locator('[data-overlay-type="crossLine"]').tap();
		const canvas = page.locator('#chart canvas').nth(1);
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		await page.touchscreen.tap(box!.x + 450, box!.y + 280);
		await expect.poll(() => page.evaluate(() => (
			window as unknown as {
				__baronTestRuntime: { listOverlays(): readonly unknown[] };
			}
		).__baronTestRuntime.listOverlays().length)).toBe(1);
		const before = await page.evaluate(() => JSON.stringify((
			window as unknown as {
				__baronTestRuntime: { exportScene(): unknown };
			}
		).__baronTestRuntime.exportScene()));
		await page.keyboard.press('Control+Z');
		await page.keyboard.press('Control+Shift+Z');
		const after = await page.evaluate(() => JSON.stringify((
			window as unknown as {
				__baronTestRuntime: { exportScene(): unknown };
			}
		).__baronTestRuntime.exportScene()));
		expect(after).toBe(before);
	} finally {
		await context.close();
	}
});

test('M1 Scene survives export, serialization, page teardown, and recreation', async ({ page }) => {
	const scene = await loadScene('m1-candle-horizontal-line.json');
	await createSourceRuntime(page, scene, false);
	const first = await page.evaluate(() => {
		const runtime = (
			window as unknown as {
				__baronTestRuntime: {
					destroy(): void;
					exportScene(): {
						overlays: Array<{
							id: string;
							type: string;
							anchor: { value: number };
							styles: unknown;
							metadata?: unknown;
						}>;
					};
				};
			}
		).__baronTestRuntime;
		const exported = runtime.exportScene();
		const serialized = JSON.stringify(exported);
		runtime.destroy();
		return {
			childrenAfterDestroy: document.querySelector('#chart')!.childElementCount,
			overlay: exported.overlays[0]!,
			serialized,
		};
	});
	expect(first.childrenAfterDestroy).toBe(0);

	await page.reload();
	const second = await page.evaluate(async (serialized) => {
		const { createKLineSceneRuntime } = await import(
			'/packages/web-runtime/src/index.ts'
		);
		const events: Array<{ type: string }> = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			JSON.parse(serialized),
			{ onEvent: (event) => events.push(event) },
		);
		const exported = runtime.exportScene() as {
			overlays: Array<{
				id: string;
				type: string;
				anchor: { value: number };
				styles: unknown;
				metadata?: unknown;
			}>;
		};
		runtime.destroy();
		return {
			childrenAfterDestroy: document.querySelector('#chart')!.childElementCount,
			eventTypes: events.map((event) => event.type),
			overlay: exported.overlays[0]!,
			overlayCount: exported.overlays.length,
		};
	}, first.serialized);

	expect(second.overlayCount).toBe(1);
	expect(second.overlay).toEqual(first.overlay);
	expect(second.overlay).toEqual(scene.overlays[0]);
	expect(Object.keys(second.overlay.anchor)).toEqual(['value']);
	expect(Number.isFinite(second.overlay.anchor.value)).toBe(true);
	expect(second.eventTypes).toEqual(['scene-ready']);
	expect(second.childrenAfterDestroy).toBe(0);
});

test('M2 scale, resize, zoom, scroll, export, and recreation preserve data coordinates', async ({ page }) => {
	const scene = await loadScene('m2-measurement-linear.json');
	await createSourceRuntime(page, scene);
	const before = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronTestRuntime: {
				listOverlays(): readonly unknown[];
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
			};
		}).__baronTestRuntime;
		return {
			overlays: runtime.listOverlays(),
			projected: runtime.projectPoint({ timestamp: 1782878400000, value: 300 }),
		};
	});
	await page.locator('[data-action="price-scale"]').selectOption('logarithmic');
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronTestRuntime: { exportScene(): { panes: Array<{ yAxes: Array<{ scale: string }> }> } };
		}
	).__baronTestRuntime.exportScene().panes[0]!.yAxes[0]!.scale)).toBe('logarithmic');

	await page.locator('#chart').evaluate((element) => {
		element.style.width = '820px';
		window.dispatchEvent(new Event('resize'));
	});
	await page.waitForTimeout(100);
	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	await page.mouse.move(chartBox!.x + 700, chartBox!.y + 500);
	await page.mouse.wheel(360, -480);
	await page.waitForTimeout(100);

	const after = await page.evaluate(async () => {
		const runtime = (window as unknown as {
			__baronTestRuntime: {
				destroy(): void;
				exportScene(): unknown;
				listOverlays(): readonly unknown[];
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
			};
		}).__baronTestRuntime;
		const overlays = runtime.listOverlays();
		const projected = runtime.projectPoint({ timestamp: 1782878400000, value: 300 });
		const serialized = JSON.stringify(runtime.exportScene());
		runtime.destroy();
		const { createKLineSceneRuntime } = await import('/packages/web-runtime/src/index.ts');
		const recreated = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			JSON.parse(serialized),
		);
		const recreatedOverlays = recreated.listOverlays();
		const recreatedScale = recreated.exportScene().panes[0]!.yAxes[0]!.scale;
		recreated.destroy();
		return { overlays, projected, recreatedOverlays, recreatedScale };
	});

	expect(after.overlays).toEqual(before.overlays);
	expect(after.recreatedOverlays).toEqual(before.overlays);
	expect(after.recreatedScale).toBe('logarithmic');
	expect(Number.isFinite(before.projected.x)).toBe(true);
	expect(Number.isFinite(before.projected.y)).toBe(true);
	expect(Number.isFinite(after.projected.x)).toBe(true);
	expect(Number.isFinite(after.projected.y)).toBe(true);
});
