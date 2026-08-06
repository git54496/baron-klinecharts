import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');
const allOverlays = loadScene('all-overlays.json');
const m1Scene = loadScene('m1-candle-horizontal-line.json');
const m2LinearScene = loadScene('m2-measurement-linear.json');

function expectTwoDecimalPrice(value: number): void {
	expect(value.toString()).toMatch(/^-?\d+(?:\.\d{1,2})?$/u);
	expect(Object.is(value, -0)).toBe(false);
}

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

test('@browser interactive price measurement commits after exactly two chart clicks', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: unknown[] = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		Object.assign(window, {
			__baronInteractiveRuntime: runtime,
			__baronInteractiveEvents: events,
		});
	}, minimalScene);

	const drawingCanvas = page.locator('#chart canvas').nth(1);
	await expect(drawingCanvas).toBeVisible();

	const measurementId = await page.evaluate(() => (
		window as unknown as {
			__baronInteractiveRuntime: {
				startOverlayDrawing(type: string): string;
			};
		}
	).__baronInteractiveRuntime.startOverlayDrawing('priceMeasurement'));
	const anchors = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronInteractiveRuntime: {
				exportScene(): { data: Array<{ timestamp: number }> };
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
			};
		}).__baronInteractiveRuntime;
		const scene = runtime.exportScene();
		return {
			start: runtime.projectPoint({ timestamp: scene.data[0]!.timestamp, value: 12.4 }),
			end: runtime.projectPoint({ timestamp: scene.data[2]!.timestamp, value: 12.8 }),
		};
	});
	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	await page.mouse.click(chartBox!.x + anchors.start.x, chartBox!.y + anchors.start.y);
	const afterStart = await page.evaluate(() => {
		const state = window as unknown as {
			__baronInteractiveRuntime: { listOverlays(): readonly unknown[] };
			__baronInteractiveEvents: Array<{ type: string }>;
		};
		return {
			createdCount: state.__baronInteractiveEvents
				.filter((event) => event.type === 'overlay-created').length,
			overlayCount: state.__baronInteractiveRuntime.listOverlays().length,
		};
	});
	expect(afterStart).toEqual({ createdCount: 0, overlayCount: 0 });

	await page.mouse.click(chartBox!.x + anchors.end.x, chartBox!.y + anchors.end.y);
	const afterEnd = await page.evaluate(() => {
		const state = window as unknown as {
			__baronInteractiveRuntime: { listOverlays(): readonly unknown[] };
			__baronInteractiveEvents: Array<{ type: string }>;
		};
		return {
			events: state.__baronInteractiveEvents,
			overlays: state.__baronInteractiveRuntime.listOverlays(),
		};
	});
	expect(afterEnd.events.filter((event) => event.type === 'overlay-created')).toEqual([
		expect.objectContaining({ type: 'overlay-created' }),
	]);
	expect(afterEnd.events.filter((event) => event.type === 'scene-error')).toEqual([]);
	expect(afterEnd.overlays).toEqual([
		expect.objectContaining({ type: 'priceMeasurement' }),
	]);

	const result = await page.evaluate((measurementId) => {
		type Measurement = {
			id: string;
			type: string;
			start?: { timestamp: number; value: number };
			end?: { timestamp: number; value: number };
		};
		const state = window as unknown as {
			__baronInteractiveRuntime: {
				exportScene(): { overlays: Measurement[] };
				listOverlays(): readonly Measurement[];
				destroy(): void;
			};
			__baronInteractiveEvents: Array<{ type: string; overlay?: Measurement }>;
		};
		const scene = state.__baronInteractiveRuntime.exportScene();
		const listed = state.__baronInteractiveRuntime.listOverlays();
		const created = state.__baronInteractiveEvents
			.filter((event) => event.type === 'overlay-created');
		state.__baronInteractiveRuntime.destroy();
		return {
			created,
			measurement: scene.overlays.find((overlay) => overlay.id === measurementId),
			listedMeasurement: listed.find((overlay) => overlay.id === measurementId),
			measurementCount: scene.overlays
				.filter((overlay) => overlay.type === 'priceMeasurement').length,
			serialized: JSON.stringify(scene),
		};
	}, measurementId);

	expect(result.created).toHaveLength(1);
	expect(result.measurementCount).toBe(1);
	expect(result.measurement).toMatchObject({
		id: measurementId,
		type: 'priceMeasurement',
		start: { timestamp: minimalScene.data[0]!.timestamp, value: 12.4 },
		end: { timestamp: minimalScene.data[2]!.timestamp, value: 12.8 },
	});
	expect(result.created[0]?.overlay).toEqual(result.measurement);
	expect(result.listedMeasurement).toEqual(result.measurement);
	expect(result.serialized).not.toMatch(/absoluteChange|percentageChange|label/u);
});

test('@browser chains two-click price measurement into one-click horizontal line in the same Runtime', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: unknown[] = [];
		const container = document.querySelector<HTMLElement>('#chart')!;
		const runtime = await createKLineSceneRuntime(
			container,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		Object.assign(window, {
			__baronChainedRuntime: runtime,
			__baronChainedEvents: events,
		});
	}, minimalScene);

	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	const measurement = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronChainedRuntime: {
				startOverlayDrawing(type: string): string;
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
			};
		}).__baronChainedRuntime;
		return {
			id: runtime.startOverlayDrawing('priceMeasurement'),
			start: runtime.projectPoint({ timestamp: 1784736000000, value: 12.4 }),
			end: runtime.projectPoint({ timestamp: 1784908800000, value: 12.8 }),
		};
	});
	await page.mouse.click(chartBox!.x + measurement.start.x, chartBox!.y + measurement.start.y);
	await page.mouse.click(chartBox!.x + measurement.end.x, chartBox!.y + measurement.end.y);

	const horizontal = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronChainedRuntime: {
				startOverlayDrawing(type: string): string;
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
			};
		}).__baronChainedRuntime;
		return {
			id: runtime.startOverlayDrawing('horizontalStraightLine'),
			point: runtime.projectPoint({ timestamp: 1784822400000, value: 12.25 }),
		};
	});
	await page.mouse.click(chartBox!.x + horizontal.point.x, chartBox!.y + horizontal.point.y);

	const result = await page.evaluate(({ measurementId, horizontalId }) => {
		type Overlay = {
			id: string;
			type: string;
			start?: { timestamp: number; value: number };
			end?: { timestamp: number; value: number };
			anchor?: { value: number };
		};
		const state = window as unknown as {
			__baronChainedRuntime: {
				exportScene(): { overlays: Overlay[] };
				destroy(): void;
			};
			__baronChainedEvents: Array<{ type: string; overlay?: Overlay }>;
		};
		const scene = state.__baronChainedRuntime.exportScene();
		const created = state.__baronChainedEvents
			.filter((event) => event.type === 'overlay-created');
		const errors = state.__baronChainedEvents
			.filter((event) => event.type === 'scene-error');
		state.__baronChainedRuntime.destroy();
		return {
			createdIds: created.map((event) => event.overlay?.id),
			errors,
			horizontal: scene.overlays.find((overlay) => overlay.id === horizontalId),
			measurement: scene.overlays.find((overlay) => overlay.id === measurementId),
			overlayCount: scene.overlays.length,
		};
	}, { measurementId: measurement.id, horizontalId: horizontal.id });

	expect(result.errors).toEqual([]);
	expect(result.createdIds).toEqual([measurement.id, horizontal.id]);
	expect(result.overlayCount).toBe(2);
	expect(result.measurement).toMatchObject({
		id: measurement.id,
		type: 'priceMeasurement',
		start: { timestamp: 1784736000000, value: 12.4 },
		end: { timestamp: 1784908800000, value: 12.8 },
	});
	expect(result.horizontal).toMatchObject({
		id: horizontal.id,
		type: 'horizontalStraightLine',
	});
	expect(Number.isFinite(result.horizontal?.anchor?.value)).toBe(true);
});

test('@browser updateOverlay normalizes an over-precision anchor to scene pricePrecision', async ({ page }) => {
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
		const events: Array<Record<string, unknown>> = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		Object.assign(window, {
			__baronPrecisionRuntime: runtime,
			__baronPrecisionEvents: events,
		});
	}, minimalScene);

	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	const drawing = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronPrecisionRuntime: {
				startOverlayDrawing(type: string): string;
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
				exportScene(): { data: Array<{ timestamp: number }> };
			};
		}).__baronPrecisionRuntime;
		const data = runtime.exportScene().data;
		return {
			id: runtime.startOverlayDrawing('horizontalStraightLine'),
			point: runtime.projectPoint({ timestamp: data[0]!.timestamp, value: 12.55 }),
		};
	});
	await page.mouse.click(chartBox!.x + drawing.point.x, chartBox!.y + drawing.point.y);

	const result = await page.evaluate(({ id, overPrecision }) => {
		type HorizontalOverlay = {
			id: string;
			type: string;
			paneId: string;
			visible: boolean;
			locked: boolean;
			zLevel: number;
			mode: string;
			styles: unknown;
			anchor: { value: number };
			metadata?: unknown;
		};
		const state = window as unknown as {
			__baronPrecisionRuntime: {
				exportScene(): { overlays: HorizontalOverlay[] };
				getOverlay(value: string): HorizontalOverlay | undefined;
				listOverlays(): readonly HorizontalOverlay[];
				updateOverlay(value: HorizontalOverlay): HorizontalOverlay;
				destroy(): void;
			};
			__baronPrecisionEvents: Array<{ type: string; overlay?: HorizontalOverlay }>;
		};
		const runtime = state.__baronPrecisionRuntime;
		const line = runtime.getOverlay(id);
		if (line === undefined) {
			throw new Error(`Overlay ${id} was not committed by the drawing click.`);
		}
		const committed = runtime.updateOverlay({
			...structuredClone(line),
			anchor: { value: overPrecision },
		});
		const updatedEvents = state.__baronPrecisionEvents.filter(
			(event) => event.type === 'overlay-updated' && event.overlay?.id === id,
		);
		const errors = state.__baronPrecisionEvents
			.filter((event) => event.type === 'scene-error');
		const exported = runtime.exportScene().overlays
			.find((overlay) => overlay.id === id);
		const getValue = runtime.getOverlay(id)?.anchor.value;
		const listValue = runtime.listOverlays()
			.find((overlay) => overlay.id === id)?.anchor.value;
		const serialized = JSON.stringify(runtime.exportScene());
		runtime.destroy();
		return {
			committedValue: committed.anchor.value,
			eventValue: updatedEvents.at(-1)?.overlay?.anchor.value,
			exportValue: exported?.anchor.value,
			getValue,
			listValue,
			errors: structuredClone(errors),
			serializedContainsRawPrecision: serialized.includes(String(overPrecision)),
		};
	}, { id: drawing.id, overPrecision: 101.67084494773519 });

	expect(result.committedValue).toBe(101.67);
	expect(result.eventValue).toBe(101.67);
	expect(result.exportValue).toBe(101.67);
	expect(result.getValue).toBe(101.67);
	expect(result.listValue).toBe(101.67);
	expect(result.errors).toEqual([]);
	expect(result.serializedContainsRawPrecision).toBe(false);
	expect(pageErrors).toEqual([]);
	expect(consoleErrors).toEqual([]);
});

test('@browser commits two consecutive one-click horizontal lines in the same Runtime inside the click arbitration window', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: unknown[] = [];
		const container = document.querySelector<HTMLElement>('#chart')!;
		const runtime = await createKLineSceneRuntime(
			container,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		type ClickStamp = { type: 'down' | 'up'; time: number; x: number; y: number };
		const clickStamps: ClickStamp[] = [];
		const recordClick = (type: 'down' | 'up') => (event: Event) => {
			const mouseEvent = event as MouseEvent;
			clickStamps.push({
				type,
				time: performance.now(),
				x: mouseEvent.clientX,
				y: mouseEvent.clientY,
			});
		};
		container.addEventListener('mousedown', recordClick('down'), true);
		container.addEventListener('mouseup', recordClick('up'), true);
		Object.assign(window, {
			__baronRapidRuntime: runtime,
			__baronRapidEvents: events,
			__baronRapidClickStamps: clickStamps,
		});
	}, minimalScene);

	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	const first = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronRapidRuntime: {
				startOverlayDrawing(type: string): string;
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
			};
		}).__baronRapidRuntime;
		return {
			id: runtime.startOverlayDrawing('horizontalStraightLine'),
			point: runtime.projectPoint({ timestamp: 1784822400000, value: 12.25 }),
		};
	});
	await page.mouse.click(chartBox!.x + first.point.x, chartBox!.y + first.point.y);

	const second = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronRapidRuntime: {
				startOverlayDrawing(type: string): string;
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
			};
		}).__baronRapidRuntime;
		return {
			id: runtime.startOverlayDrawing('horizontalStraightLine'),
			point: runtime.projectPoint({ timestamp: 1784908800000, value: 12.8 }),
		};
	});
	await page.mouse.click(chartBox!.x + second.point.x, chartBox!.y + second.point.y);

	const result = await page.evaluate(({ firstId, secondId }) => {
		type Overlay = {
			id: string;
			type: string;
			anchor?: { value: number };
		};
		type ClickStamp = { type: 'down' | 'up'; time: number; x: number; y: number };
		const state = window as unknown as {
			__baronRapidRuntime: {
				exportScene(): { overlays: Overlay[] };
				destroy(): void;
			};
			__baronRapidEvents: Array<{ type: string; overlay?: Overlay }>;
			__baronRapidClickStamps: ClickStamp[];
		};
		const scene = state.__baronRapidRuntime.exportScene();
		const created = state.__baronRapidEvents
			.filter((event) => event.type === 'overlay-created');
		const errors = state.__baronRapidEvents
			.filter((event) => event.type === 'scene-error');
		state.__baronRapidRuntime.destroy();
		return {
			createdIds: created.map((event) => event.overlay?.id),
			errors,
			first: scene.overlays.find((overlay) => overlay.id === firstId),
			second: scene.overlays.find((overlay) => overlay.id === secondId),
			overlayCount: scene.overlays.length,
			clickStamps: structuredClone(state.__baronRapidClickStamps),
		};
	}, { firstId: first.id, secondId: second.id });

	// 证明测试真实落在引擎 500ms 点击仲裁窗口内（mousedown 起计时、mouseup 判定）且两点相距 ≥ 50px，
	// 防止通过放慢点击节奏绕过回归。
	expect(result.clickStamps).toHaveLength(4);
	const [down1, up1, down2, up2] = result.clickStamps;
	expect(down1?.type).toBe('down');
	expect(up1?.type).toBe('up');
	expect(down2?.type).toBe('down');
	expect(up2?.type).toBe('up');
	expect(up2!.time - down1!.time).toBeLessThan(500);
	expect(Math.hypot(down2!.x - down1!.x, down2!.y - down1!.y)).toBeGreaterThanOrEqual(50);

	expect(result.errors).toEqual([]);
	expect(result.createdIds).toEqual([first.id, second.id]);
	expect(result.overlayCount).toBe(2);
	expect(result.first).toMatchObject({
		id: first.id,
		type: 'horizontalStraightLine',
	});
	expect(result.second).toMatchObject({
		id: second.id,
		type: 'horizontalStraightLine',
	});
	expect(Number.isFinite(result.first?.anchor?.value)).toBe(true);
	expect(Number.isFinite(result.second?.anchor?.value)).toBe(true);
});

test('@browser routes a new drawing click within 12px of a repriced controlled overlay to the in-progress drawing', async ({ page }) => {
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
		const container = document.querySelector<HTMLElement>('#chart')!;
		const runtime = await createKLineSceneRuntime(
			container,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		type ClickStamp = { type: 'down' | 'up'; time: number; x: number; y: number };
		const clickStamps: ClickStamp[] = [];
		const recordClick = (type: 'down' | 'up') => (event: Event) => {
			const mouseEvent = event as MouseEvent;
			clickStamps.push({
				type,
				time: performance.now(),
				x: mouseEvent.clientX,
				y: mouseEvent.clientY,
			});
		};
		container.addEventListener('mousedown', recordClick('down'), true);
		container.addEventListener('mouseup', recordClick('up'), true);
		Object.assign(window, {
			__baronNearLineRuntime: runtime,
			__baronNearLineEvents: events,
			__baronNearLineStamps: clickStamps,
		});
	}, minimalScene);

	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	const measurement = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronNearLineRuntime: {
				startOverlayDrawing(type: string): string;
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
				exportScene(): { data: Array<{ timestamp: number }> };
			};
		}).__baronNearLineRuntime;
		const data = runtime.exportScene().data;
		return {
			id: runtime.startOverlayDrawing('priceMeasurement'),
			start: runtime.projectPoint({ timestamp: data[0]!.timestamp, value: 12.4 }),
			end: runtime.projectPoint({ timestamp: data[2]!.timestamp, value: 12.8 }),
		};
	});
	await page.mouse.click(chartBox!.x + measurement.start.x, chartBox!.y + measurement.start.y);
	await page.mouse.click(chartBox!.x + measurement.end.x, chartBox!.y + measurement.end.y);

	const first = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__baronNearLineRuntime: {
				startOverlayDrawing(type: string): string;
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
				exportScene(): { data: Array<{ timestamp: number }> };
			};
		}).__baronNearLineRuntime;
		const data = runtime.exportScene().data;
		return {
			id: runtime.startOverlayDrawing('horizontalStraightLine'),
			point: runtime.projectPoint({ timestamp: data[0]!.timestamp, value: 12.25 }),
		};
	});
	await page.mouse.click(chartBox!.x + first.point.x, chartBox!.y + first.point.y);

	const nearLine = await page.evaluate((firstId) => {
		type HorizontalOverlay = {
			id: string;
			type: string;
			paneId: string;
			visible: boolean;
			locked: boolean;
			zLevel: number;
			mode: string;
			styles: unknown;
			anchor: { value: number };
			metadata?: unknown;
		};
		const runtime = (window as unknown as {
			__baronNearLineRuntime: {
				getOverlay(id: string): HorizontalOverlay | undefined;
				updateOverlay(overlay: HorizontalOverlay): HorizontalOverlay;
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
				exportScene(): { data: Array<{ timestamp: number }> };
			};
		}).__baronNearLineRuntime;
		const line = runtime.getOverlay(firstId)!;
		runtime.updateOverlay({ ...structuredClone(line), anchor: { value: 12.4 } });
		const data = runtime.exportScene().data;
		const lineY = runtime.projectPoint({
			timestamp: data[0]!.timestamp,
			value: 12.4,
		}).y;
		let clickValue: number | undefined;
		let distance = Number.POSITIVE_INFINITY;
		for (let step = 1; step <= 30; step++) {
			for (const candidate of [12.4 - step * 0.01, 12.4 + step * 0.01]) {
				const y = runtime.projectPoint({
					timestamp: data[0]!.timestamp,
					value: candidate,
				}).y;
				const candidateDistance = Math.abs(y - lineY);
				if (candidateDistance >= 6 && candidateDistance <= 12) {
					clickValue = candidate;
					distance = candidateDistance;
					break;
				}
			}
			if (clickValue !== undefined) {
				break;
			}
		}
		if (clickValue === undefined) {
			throw new Error('No 6..12px click candidate found near the repriced line.');
		}
		return {
			distance,
			point: runtime.projectPoint({
				timestamp: data[0]!.timestamp,
				value: clickValue,
			}),
		};
	}, first.id);
	expect(nearLine.distance).toBeGreaterThanOrEqual(6);
	expect(nearLine.distance).toBeLessThanOrEqual(12);

	const second = await page.evaluate(() => (
		window as unknown as {
			__baronNearLineRuntime: { startOverlayDrawing(type: string): string };
		}
	).__baronNearLineRuntime.startOverlayDrawing('horizontalStraightLine'));
	await page.mouse.click(chartBox!.x + nearLine.point.x, chartBox!.y + nearLine.point.y);

	const result = await page.evaluate(({ measurementId, firstId, secondId }) => {
		type Overlay = {
			id: string;
			type: string;
			anchor?: { value: number };
		};
		type ClickStamp = { type: 'down' | 'up'; time: number; x: number; y: number };
		const state = window as unknown as {
			__baronNearLineRuntime: {
				exportScene(): { overlays: Overlay[] };
				destroy(): void;
			};
			__baronNearLineEvents: Array<{ type: string; overlay?: Overlay }>;
			__baronNearLineStamps: ClickStamp[];
		};
		const scene = state.__baronNearLineRuntime.exportScene();
		const created = state.__baronNearLineEvents
			.filter((event) => event.type === 'overlay-created');
		const errors = state.__baronNearLineEvents
			.filter((event) => event.type === 'scene-error');
		state.__baronNearLineRuntime.destroy();
		return {
			clickStamps: structuredClone(state.__baronNearLineStamps),
			createdIds: created.map((event) => event.overlay?.id),
			errors,
			first: scene.overlays.find((overlay) => overlay.id === firstId),
			measurement: scene.overlays.find((overlay) => overlay.id === measurementId),
			overlayCount: scene.overlays.length,
			second: scene.overlays.find((overlay) => overlay.id === secondId),
		};
	}, { measurementId: measurement.id, firstId: first.id, secondId: second });

	// 断言 4 次点击的 mousedown/mouseup 全部真实派发。若 adapter 把末次点击当作已有
	// 受控 overlay 的拖拽消费，preventDefault 会抑制兼容鼠标事件，stamps 将不足 8 条。
	expect(result.clickStamps).toHaveLength(8);
	expect(result.clickStamps.map((stamp) => stamp.type)).toEqual([
		'down',
		'up',
		'down',
		'up',
		'down',
		'up',
		'down',
		'up',
	]);
	expect(result.errors).toEqual([]);
	expect(result.createdIds).toEqual([measurement.id, first.id, second]);
	expect(result.overlayCount).toBe(3);
	expect(result.measurement).toMatchObject({
		id: measurement.id,
		type: 'priceMeasurement',
	});
	expect(result.first).toMatchObject({
		id: first.id,
		type: 'horizontalStraightLine',
	});
	expect(result.second).toMatchObject({
		id: second,
		type: 'horizontalStraightLine',
	});
	expect(result.first?.anchor?.value).toBeCloseTo(12.4, 2);
	expect(Number.isFinite(result.second?.anchor?.value)).toBe(true);
	expect(result.second?.anchor?.value).not.toBeCloseTo(12.4, 2);
	expect(pageErrors).toEqual([]);
	expect(consoleErrors).toEqual([]);
});

test('@browser adds MA and VOL indicators with frozen M3 params and restores them in Scene', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: unknown[] = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		const ma = runtime.addIndicator({
			name: 'MA',
			calcParams: [18, 45, 60, 200, 250],
		});
		const vol = runtime.addIndicator({
			name: 'VOL',
			calcParams: [5, 10, 20],
		});
		const before = runtime.listIndicators().map((item) => ({
			id: item.id,
			name: item.name,
			calcParams: item.calcParams,
		}));
		const removed = runtime.removeIndicator(vol.id);
		const after = runtime.listIndicators().map((item) => item.id);
		const sceneIndicators = runtime.exportScene().panes
			.flatMap((pane) => pane.indicators)
			.map((item) => ({
				id: item.id,
				name: item.name,
				calcParams: item.calcParams,
			}));
		runtime.destroy();
		return {
			ma,
			vol,
			before,
			removed,
			after,
			sceneIndicators,
			events: events.map((event) => (event as { type: string }).type),
		};
	}, minimalScene);

	expect(result.ma.name).toBe('MA');
	expect(result.ma.calcParams).toEqual([18, 45, 60, 200, 250]);
	expect(result.vol.name).toBe('VOL');
	expect(result.vol.calcParams).toEqual([5, 10, 20]);
	expect(result.before.map((item) => item.name)).toEqual(['MA', 'VOL']);
	expect(result.removed).toBe(true);
	expect(result.after).toEqual([result.ma.id]);
	expect(result.sceneIndicators).toEqual([
		{ id: result.ma.id, name: 'MA', calcParams: [18, 45, 60, 200, 250] },
	]);
	expect(result.events).toEqual(
		expect.arrayContaining(['indicator-created', 'indicator-removed']),
	);
});

test('@browser emits fullscreen-changed and toggles runtime fullscreen state', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: unknown[] = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		const container = document.querySelector<HTMLElement>('#chart')!;
		Object.defineProperty(container, 'requestFullscreen', {
			configurable: true,
			value: async () => {
				Object.defineProperty(document, 'fullscreenElement', {
					configurable: true,
					value: container,
				});
				document.dispatchEvent(new Event('fullscreenchange'));
			},
		});
		Object.defineProperty(document, 'exitFullscreen', {
			configurable: true,
			value: async () => {
				Object.defineProperty(document, 'fullscreenElement', {
					configurable: true,
					value: null,
				});
				document.dispatchEvent(new Event('fullscreenchange'));
			},
		});
		await runtime.enterFullscreen();
		const active = runtime.isFullscreen();
		await runtime.exitFullscreen();
		const inactive = runtime.isFullscreen();
		const fullscreenEvents = events.filter(
			(event) => (event as { type: string }).type === 'fullscreen-changed',
		);
		runtime.destroy();
		return { active, inactive, fullscreenEvents };
	}, minimalScene);

	expect(result.active).toBe(true);
	expect(result.inactive).toBe(false);
	expect(result.fullscreenEvents).toEqual([
		expect.objectContaining({ type: 'fullscreen-changed', active: true }),
		expect.objectContaining({ type: 'fullscreen-changed', active: false }),
	]);
});

test('@browser emits crosshair-changed with OHLCV bar after mouse move', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: unknown[] = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		Object.assign(window, {
			__baronCrosshairRuntime: runtime,
			__baronCrosshairEvents: events,
		});
	}, minimalScene);

	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	await page.mouse.move(
		chartBox!.x + chartBox!.width / 2,
		chartBox!.y + chartBox!.height / 2,
	);

	await page.waitForFunction(() => {
		const events = (window as unknown as {
			__baronCrosshairEvents: Array<{
				type: string;
				timestamp: number | null;
			}>;
		}).__baronCrosshairEvents;
		return events.some(
			(event) => event.type === 'crosshair-changed' && event.timestamp !== null,
		);
	}, undefined, { timeout: 5000 });

	const result = await page.evaluate(() => {
		const state = window as unknown as {
			__baronCrosshairRuntime: { destroy(): void };
			__baronCrosshairEvents: Array<{
				type: string;
				timestamp: number | null;
				bar: {
					open: number;
					high: number;
					low: number;
					close: number;
				} | null;
			}>;
		};
		const event = state.__baronCrosshairEvents.find(
			(candidate) =>
				candidate.type === 'crosshair-changed' &&
				candidate.timestamp !== null,
		)!;
		state.__baronCrosshairRuntime.destroy();
		return event;
	});

	expect(result.type).toBe('crosshair-changed');
	expect(typeof result.timestamp).toBe('number');
	expect(result.bar).toMatchObject({
		open: expect.any(Number),
		high: expect.any(Number),
		low: expect.any(Number),
		close: expect.any(Number),
	});
});

test('@browser completes the M1 horizontal line lifecycle with stable Scene data', async ({ page }) => {
	const createdId = 'overlay-m1-runtime-horizontal';
	const drawPosition = { x: 500, y: 170 };
	await page.goto('/test/fixture.html');
	const setup = await page.evaluate(async ({ scene, id }) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const events: Array<{
			type: string;
			id?: string;
			overlay?: { id: string; anchor: { value: number } };
		}> = [];
		const source = scene.overlays[0]!;
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		const startedId = runtime.startOverlayDrawing(
			'horizontalStraightLine',
			{
				id,
				paneId: source.paneId,
				styles: source.styles,
				metadata: source.metadata,
			},
		);
		Object.assign(window, {
			__baronM1Runtime: runtime,
			__baronM1Events: events,
		});
		return {
			initialIds: runtime.listOverlays().map((overlay) => overlay.id),
			startedId,
		};
	}, { scene: m1Scene, id: createdId });

	expect(setup.startedId).toBe(createdId);
	expect(setup.initialIds).toEqual(['overlay-m1-horizontal-reference']);

	const drawingCanvas = page.locator('#chart canvas').nth(1);
	await expect(drawingCanvas).toBeVisible();
	await drawingCanvas.click({ position: drawPosition });
	await expect.poll(() => page.evaluate(() => {
		const events = (
			window as unknown as {
				__baronM1Events: Array<{ type: string }>;
			}
		).__baronM1Events;
		return events.filter((event) => event.type === 'overlay-created').length;
	})).toBe(1);

	const createdState = await page.evaluate((id) => {
		type HorizontalOverlay = { id: string; anchor: { value: number } };
		const state = window as unknown as {
			__baronM1Runtime: {
				exportScene(): { overlays: HorizontalOverlay[] };
				getOverlay(value: string): HorizontalOverlay | undefined;
				listOverlays(): readonly HorizontalOverlay[];
			};
			__baronM1Events: Array<{
				type: string;
				overlay?: HorizontalOverlay;
			}>;
		};
		return {
			createdEventValue: state.__baronM1Events
				.find((event) => event.type === 'overlay-created' && event.overlay?.id === id)
				?.overlay?.anchor.value,
			exportValue: state.__baronM1Runtime.exportScene().overlays
				.find((overlay) => overlay.id === id)?.anchor.value,
			getValue: state.__baronM1Runtime.getOverlay(id)?.anchor.value,
			listValue: state.__baronM1Runtime.listOverlays()
				.find((overlay) => overlay.id === id)?.anchor.value,
		};
	}, createdId);
	expect(createdState).toEqual({
		createdEventValue: 101.67,
		exportValue: 101.67,
		getValue: 101.67,
		listValue: 101.67,
	});

	const drawingBox = await drawingCanvas.boundingBox();
	expect(drawingBox).not.toBeNull();
	const linePosition = {
		x: drawingBox!.x + drawPosition.x,
		y: drawingBox!.y + drawPosition.y,
	};
	await page.mouse.click(linePosition.x, linePosition.y);
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronM1Runtime: { getSelectedOverlayId(): string | undefined };
		}
	).__baronM1Runtime.getSelectedOverlayId())).toBe(createdId);
	const updatesBeforeDrag = await page.evaluate(() => (
		window as unknown as { __baronM1Events: Array<{ type: string }> }
	).__baronM1Events.filter((event) => event.type === 'overlay-updated').length);
	await page.mouse.move(linePosition.x, linePosition.y);
	await page.mouse.down();
	await page.mouse.move(linePosition.x, linePosition.y + 37, { steps: 5 });
	await page.mouse.up();
	await expect.poll(() => page.evaluate(() => (
		window as unknown as { __baronM1Events: Array<{ type: string }> }
	).__baronM1Events.filter((event) => event.type === 'overlay-updated').length))
		.toBeGreaterThan(updatesBeforeDrag);

	const updatedState = await page.evaluate((id) => {
		type HorizontalOverlay = { id: string; anchor: { value: number } };
		const state = window as unknown as {
			__baronM1Runtime: {
				exportScene(): { overlays: HorizontalOverlay[] };
				getOverlay(value: string): HorizontalOverlay | undefined;
				listOverlays(): readonly HorizontalOverlay[];
			};
			__baronM1Events: Array<{
				type: string;
				overlay?: HorizontalOverlay;
			}>;
		};
		const updatedEvents = state.__baronM1Events.filter(
			(event) => event.type === 'overlay-updated' && event.overlay?.id === id,
		);
		return {
			eventValue: updatedEvents.at(-1)?.overlay?.anchor.value,
			exportValue: state.__baronM1Runtime.exportScene().overlays
				.find((overlay) => overlay.id === id)?.anchor.value,
			getValue: state.__baronM1Runtime.getOverlay(id)?.anchor.value,
			listValue: state.__baronM1Runtime.listOverlays()
				.find((overlay) => overlay.id === id)?.anchor.value,
		};
	}, createdId);
	for (const value of Object.values(updatedState)) {
		expect(value).toBeDefined();
		expectTwoDecimalPrice(value!);
	}

	const roundTrip = await page.evaluate(async (id) => {
		type HorizontalOverlay = {
			id: string;
			type: string;
			paneId: string;
			anchor: { value: number };
			styles: unknown;
			metadata?: unknown;
		};
		const state = window as unknown as {
			__baronM1Runtime: {
				destroy(): void;
				exportScene(): { overlays: HorizontalOverlay[] };
				getOverlay(value: string): HorizontalOverlay | undefined;
				getScene(): unknown;
				listOverlays(): readonly HorizontalOverlay[];
			};
			__baronM1Events: Array<{ type: string; id?: string }>;
		};
		const firstOverlay = state.__baronM1Runtime.getOverlay(id)!;
		const listedIds = state.__baronM1Runtime
			.listOverlays()
			.map((overlay) => overlay.id);
		const firstExport = state.__baronM1Runtime.exportScene();
		const serialized = JSON.stringify(firstExport);
		const createdEventCount = state.__baronM1Events
			.filter((event) => event.type === 'overlay-created').length;
		const firstEventCountBeforeDestroy = state.__baronM1Events.length;
		state.__baronM1Runtime.destroy();
		let destroyedErrorCode = '';
		try {
			state.__baronM1Runtime.getScene();
		} catch (error) {
			destroyedErrorCode = (error as { code?: string }).code ?? '';
		}
		const firstEventCountAfterDestroy = state.__baronM1Events.length;
		const firstChildrenAfterDestroy = document.querySelector('#chart')!.childElementCount;

		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const recreatedEvents: Array<{ type: string; id?: string }> = [];
		const recreated = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			JSON.parse(serialized),
			{ onEvent: (event) => recreatedEvents.push(event) },
		);
		const secondExport = recreated.exportScene() as { overlays: HorizontalOverlay[] };
		const secondOverlay = recreated.getOverlay(id) as HorizontalOverlay;
		Object.assign(window, {
			__baronM1RecreatedRuntime: recreated,
			__baronM1RecreatedEvents: recreatedEvents,
		});
		return {
			createdEventCount,
			destroyedErrorCode,
			firstChildrenAfterDestroy,
			firstEventCountAfterDestroy,
			firstEventCountBeforeDestroy,
			firstOverlay,
			listedIds,
			recreatedChildren: document.querySelector('#chart')!.childElementCount,
			secondOverlay,
			secondOverlayIds: secondExport.overlays.map((overlay) => overlay.id),
			serialized,
		};
	}, createdId);

	expect(roundTrip.createdEventCount).toBe(1);
	expect(roundTrip.listedIds).toEqual([
		'overlay-m1-horizontal-reference',
		createdId,
	]);
	expect(roundTrip.firstOverlay).toEqual(expect.objectContaining({
		id: createdId,
		type: 'horizontalStraightLine',
		paneId: 'pane-candle',
		styles: m1Scene.overlays[0]!.styles,
		metadata: m1Scene.overlays[0]!.metadata,
	}));
	expect(Number.isFinite(roundTrip.firstOverlay.anchor.value)).toBe(true);
	expect(Object.keys(roundTrip.firstOverlay.anchor)).toEqual(['value']);
	expect(roundTrip.secondOverlay).toEqual(roundTrip.firstOverlay);
	expect(roundTrip.secondOverlayIds).toEqual(roundTrip.listedIds);
	expect(JSON.parse(roundTrip.serialized).overlays).toHaveLength(2);
	expect(roundTrip.destroyedErrorCode).toBe('RUNTIME_INIT_FAILED');
	expect(roundTrip.firstEventCountAfterDestroy)
		.toBe(roundTrip.firstEventCountBeforeDestroy);
	expect(roundTrip.firstChildrenAfterDestroy).toBe(0);
	expect(roundTrip.recreatedChildren).toBeGreaterThan(0);

	const recreatedCanvas = page.locator('#chart canvas').nth(1);
	await expect(recreatedCanvas).toBeVisible();
	await recreatedCanvas.click({
		position: { x: drawPosition.x, y: drawPosition.y + 37 },
	});
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronM1RecreatedRuntime: { getSelectedOverlayId(): string | undefined };
		}
	).__baronM1RecreatedRuntime.getSelectedOverlayId())).toBe(createdId);

	const removal = await page.evaluate((id) => {
		const state = window as unknown as {
			__baronM1RecreatedRuntime: {
				destroy(): void;
				listOverlays(): Array<{ id: string }>;
				removeOverlay(value: string): boolean;
			};
			__baronM1RecreatedEvents: Array<{ type: string; id?: string }>;
		};
		const removed = state.__baronM1RecreatedRuntime.removeOverlay(id);
		const remainingIds = state.__baronM1RecreatedRuntime
			.listOverlays()
			.map((overlay) => overlay.id);
		const removedEvents = state.__baronM1RecreatedEvents
			.filter((event) => event.type === 'overlay-removed');
		const eventCountBeforeDestroy = state.__baronM1RecreatedEvents.length;
		state.__baronM1RecreatedRuntime.destroy();
		let destroyedErrorCode = '';
		try {
			state.__baronM1RecreatedRuntime.removeOverlay(id);
		} catch (error) {
			destroyedErrorCode = (error as { code?: string }).code ?? '';
		}
		return {
			childrenAfterDestroy: document.querySelector('#chart')!.childElementCount,
			destroyedErrorCode,
			eventCountAfterDestroy: state.__baronM1RecreatedEvents.length,
			eventCountBeforeDestroy,
			remainingIds,
			removed,
			removedEvents,
		};
	}, createdId);

	expect(removal.removed).toBe(true);
	expect(removal.remainingIds).toEqual(['overlay-m1-horizontal-reference']);
	expect(removal.removedEvents).toEqual([
		expect.objectContaining({ type: 'overlay-removed', id: createdId }),
	]);
	expect(removal.destroyedErrorCode).toBe('RUNTIME_INIT_FAILED');
	expect(removal.eventCountAfterDestroy).toBe(removal.eventCountBeforeDestroy);
	expect(removal.childrenAfterDestroy).toBe(0);
});

test('@browser M2 switches linear/logarithmic scale without changing fixed prices and restores after recreate', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const runtime = await createKLineSceneRuntime(container, scene);
		const timestamp = scene.data[10]!.timestamp;
		const beforeValues = runtime.listOverlays().map((overlay) => ({
			id: overlay.id,
			anchor: overlay.anchor,
			start: overlay.start,
			end: overlay.end,
		}));
		const linearY = runtime.projectPoint({ timestamp, value: 300 }).y;
		const switched = await runtime.setPriceScale('logarithmic');
		const logarithmicY = runtime.projectPoint({ timestamp, value: 300 }).y;
		const serialized = JSON.stringify(runtime.exportScene());
		runtime.destroy();
		const recreated = await createKLineSceneRuntime(container, JSON.parse(serialized));
		const recreatedScene = recreated.exportScene();
		const afterValues = recreated.listOverlays().map((overlay) => ({
			id: overlay.id,
			anchor: overlay.anchor,
			start: overlay.start,
			end: overlay.end,
		}));
		recreated.destroy();
		return {
			beforeValues,
			afterValues,
			linearY,
			logarithmicY,
			runtimeVersion: switched.runtime.runtimeVersion,
			scale: switched.panes[0]!.yAxes[0]!.scale,
			recreatedScale: recreatedScene.panes[0]!.yAxes[0]!.scale,
		};
	}, m2LinearScene);

	expect(result.beforeValues).toEqual(result.afterValues);
	expect(result.runtimeVersion).toBe('0.2.0');
	expect(result.scale).toBe('logarithmic');
	expect(result.recreatedScale).toBe('logarithmic');
	expect(Math.abs(result.linearY - result.logarithmicY)).toBeGreaterThan(0.01);
});

test('@browser M2 rejects logarithmic scale atomically when market data contains a non-positive price', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const candidate = structuredClone(scene);
		candidate.data[0]!.low = 0;
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			candidate,
		);
		const before = JSON.stringify(runtime.exportScene());
		let errorCode = '';
		try {
			await runtime.setPriceScale('logarithmic');
		} catch (error) {
			errorCode = (error as { code?: string }).code ?? '';
		}
		const after = JSON.stringify(runtime.exportScene());
		runtime.destroy();
		return { after, before, errorCode };
	}, m2LinearScene);

	expect(result.errorCode).toBe('INVALID_MARKET_DATA');
	expect(result.after).toBe(result.before);
});

test('@browser M2 measurement anchor drag changes only the chosen endpoint', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const setup = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const source = scene.overlays.find((overlay: { type: string }) => overlay.type === 'priceMeasurement')!;
		const overlay = runtime.addOverlay({
			...structuredClone(source),
			id: 'm2-anchor-measurement',
			zLevel: 30,
			start: { timestamp: scene.data[4]!.timestamp, value: 300 },
			end: { timestamp: scene.data[12]!.timestamp, value: 320 },
		});
		const events: Array<Record<string, unknown>> = [];
		runtime.subscribe((event) => events.push(event));
		Object.assign(window, { __baronM2AnchorRuntime: runtime, __baronM2AnchorEvents: events });
		return {
			before: overlay,
			origin: runtime.projectPoint(overlay.start),
			target: runtime.projectPoint({ timestamp: scene.data[6]!.timestamp, value: 304.321 }),
		};
	}, m2LinearScene);
	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	await page.mouse.move(chartBox!.x + setup.origin.x, chartBox!.y + setup.origin.y);
	await page.mouse.down();
	await page.mouse.move(chartBox!.x + setup.target.x, chartBox!.y + setup.target.y, { steps: 4 });
	await page.mouse.up();

	const result = await page.evaluate(() => {
		const state = window as unknown as {
			__baronM2AnchorRuntime: {
				getOverlay(id: string): unknown;
				destroy(): void;
			};
			__baronM2AnchorEvents: Array<Record<string, unknown>>;
		};
		const overlay = state.__baronM2AnchorRuntime.getOverlay('m2-anchor-measurement');
		state.__baronM2AnchorRuntime.destroy();
		return { events: state.__baronM2AnchorEvents, overlay };
	});
	const overlay = result.overlay as typeof setup.before;
	expect(overlay.end).toEqual(setup.before.end);
	expect(overlay.start).not.toEqual(setup.before.start);
	expect(overlay.start.timestamp).toBe(m2LinearScene.data[6]!.timestamp);
	expect(overlay.start.value).toBeCloseTo(304.321, 1);
	expect(String(overlay.start.value)).toMatch(/^\d+(?:\.\d{1,3})?$/u);
	expect(result.events).toEqual(expect.arrayContaining([
		expect.objectContaining({
			type: 'overlay-drag-started',
			target: 'anchor',
			anchorIndex: 0,
		}),
	]));
});

test('@browser M2 measurement drag emits frozen event order and preserves the last committed export on cancel', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const setup = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime } = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const source = scene.overlays.find((overlay: { type: string }) => overlay.type === 'priceMeasurement')!;
		const overlay = runtime.addOverlay({
			...structuredClone(source),
			id: 'm2-interaction-measurement',
			zLevel: 20,
			start: { timestamp: scene.data[4]!.timestamp, value: 300 },
			end: { timestamp: scene.data[12]!.timestamp, value: 320 },
		});
		const events: Array<Record<string, unknown>> = [];
		const progressExports: unknown[] = [];
		runtime.subscribe((event) => {
			events.push(event);
			if (event.type === 'overlay-dragging') {
				progressExports.push(runtime.getOverlay(overlay.id));
			}
		});
		const origin = runtime.projectPoint({
			timestamp: scene.data[8]!.timestamp,
			value: 310,
		});
		const target = runtime.projectPoint({
			timestamp: scene.data[9]!.timestamp,
			value: 315,
		});
		Object.assign(window, {
			__baronM2Runtime: runtime,
			__baronM2Events: events,
			__baronM2ProgressExports: progressExports,
		});
		return { origin, target, before: overlay };
	}, m2LinearScene);
	const chartBox = await page.locator('#chart').boundingBox();
	expect(chartBox).not.toBeNull();
	await page.mouse.move(chartBox!.x + setup.origin.x, chartBox!.y + setup.origin.y);
	await page.mouse.down();
	await page.mouse.move(chartBox!.x + setup.target.x, chartBox!.y + setup.target.y, { steps: 4 });
	await page.mouse.up();

	const committed = await page.evaluate(() => {
		const state = window as unknown as {
			__baronM2Runtime: {
				getOverlay(id: string): unknown;
				exportScene(): unknown;
			};
			__baronM2Events: Array<Record<string, unknown>>;
			__baronM2ProgressExports: unknown[];
		};
		return {
			overlay: state.__baronM2Runtime.getOverlay('m2-interaction-measurement'),
			exported: state.__baronM2Runtime.exportScene(),
			events: state.__baronM2Events,
			progressExports: state.__baronM2ProgressExports,
		};
	});
	const dragTypes = committed.events
		.map((event) => event.type)
		.filter((type) => typeof type === 'string' && type.startsWith('overlay-drag'));
	expect(dragTypes[0]).toBe('overlay-drag-started');
	expect(dragTypes.at(-1)).toBe('overlay-drag-committed');
	expect(dragTypes).not.toContain('overlay-drag-cancelled');
	expect(committed.events.at(-1)).toEqual(expect.objectContaining({
		type: 'overlay-updated',
		sceneVersion: 1,
		runtimeVersion: '0.2.0',
	}));
	const committedOverlay = committed.overlay as {
		start: { timestamp: number; value: number };
		end: { timestamp: number; value: number };
	};
	for (const progress of committed.progressExports) {
		expect(progress).toEqual(setup.before);
	}
	expect(committedOverlay.end.value - committedOverlay.start.value).toBe(20);
	expect(m2LinearScene.data.indexOf(
		m2LinearScene.data.find((bar) => bar.timestamp === committedOverlay.end.timestamp)!,
	) - m2LinearScene.data.indexOf(
		m2LinearScene.data.find((bar) => bar.timestamp === committedOverlay.start.timestamp)!,
	)).toBe(8);

	const cancelSetup = await page.evaluate(() => {
		const state = window as unknown as {
			__baronM2Runtime: {
				getScene(): { data: Array<{ timestamp: number }> };
				getOverlay(id: string): {
					start: { timestamp: number; value: number };
					end: { timestamp: number; value: number };
				};
				projectPoint(point: { timestamp: number; value: number }): { x: number; y: number };
			};
			__baronM2Events: Array<Record<string, unknown>>;
		};
		const overlay = state.__baronM2Runtime.getOverlay('m2-interaction-measurement');
		const data = state.__baronM2Runtime.getScene().data;
		const startIndex = data.findIndex((bar) => bar.timestamp === overlay.start.timestamp);
		const endIndex = data.findIndex((bar) => bar.timestamp === overlay.end.timestamp);
		const timestamp = data[Math.round((startIndex + endIndex) / 2)]!.timestamp;
		const value = (overlay.start.value + overlay.end.value) / 2;
		return {
			before: structuredClone(overlay),
			origin: state.__baronM2Runtime.projectPoint({ timestamp, value }),
			target: state.__baronM2Runtime.projectPoint({ timestamp, value: value + 4 }),
			eventCount: state.__baronM2Events.length,
		};
	});
	await page.mouse.move(chartBox!.x + cancelSetup.origin.x, chartBox!.y + cancelSetup.origin.y);
	await page.mouse.down();
	await page.mouse.move(chartBox!.x + cancelSetup.target.x, chartBox!.y + cancelSetup.target.y, { steps: 3 });
	await page.keyboard.press('Escape');
	const cancelled = await page.evaluate((eventCount) => {
		const state = window as unknown as {
			__baronM2Runtime: { getOverlay(id: string): unknown; destroy(): void };
			__baronM2Events: Array<Record<string, unknown>>;
		};
		const overlay = state.__baronM2Runtime.getOverlay('m2-interaction-measurement');
		const events = state.__baronM2Events.slice(eventCount);
		state.__baronM2Runtime.destroy();
		return { overlay, events };
	}, cancelSetup.eventCount);
	expect(cancelled.overlay).toEqual(cancelSetup.before);
	expect(cancelled.events.map((event) => event.type)).toEqual(expect.arrayContaining([
		'overlay-drag-started',
		'overlay-dragging',
		'overlay-drag-cancelled',
	]));
	expect(cancelled.events.find((event) => event.type === 'overlay-drag-cancelled'))
		.toEqual(expect.objectContaining({ reason: 'escape' }));
});

test('@browser M2 emits every frozen drag cancellation reason without committing progress', async ({ page }) => {
	for (const reason of [
		'pointer-cancel',
		'window-blur',
		'destroy',
		'validation-error',
	] as const) {
		await page.goto('/test/fixture.html');
		const setup = await page.evaluate(async ({ scene, reason: cancellationReason }) => {
			const { createKLineSceneRuntime } = await import('/src/index.ts');
			const runtime = await createKLineSceneRuntime(
				document.querySelector<HTMLElement>('#chart')!,
				scene,
			);
			const source = scene.overlays.find((overlay: { type: string }) => overlay.type === 'priceMeasurement')!;
			const overlay = runtime.addOverlay({
				...structuredClone(source),
				id: `m2-cancel-${cancellationReason}`,
				zLevel: 40,
				start: { timestamp: scene.data[4]!.timestamp, value: 300 },
				end: { timestamp: scene.data[12]!.timestamp, value: 320 },
			});
			const events: Array<Record<string, unknown>> = [];
			runtime.subscribe((event) => events.push(event));
			let pointerId = -1;
			window.addEventListener('pointerdown', (event) => {
				pointerId = event.pointerId;
			}, { capture: true, once: true });
			Object.assign(window, {
				__baronM2CancelRuntime: runtime,
				__baronM2CancelEvents: events,
				__baronM2CancelPointerId: () => pointerId,
			});
			const originTimestamp = scene.data[8]!.timestamp;
			const target = cancellationReason === 'validation-error'
				? { timestamp: scene.data.at(-1)!.timestamp, value: 314 }
				: { timestamp: scene.data[9]!.timestamp, value: 314 };
			return {
				before: overlay,
				origin: runtime.projectPoint({ timestamp: originTimestamp, value: 310 }),
				target: runtime.projectPoint(target),
			};
		}, { scene: m2LinearScene, reason });
		const chartBox = await page.locator('#chart').boundingBox();
		expect(chartBox).not.toBeNull();
		await page.mouse.move(chartBox!.x + setup.origin.x, chartBox!.y + setup.origin.y);
		await page.mouse.down();
		await page.mouse.move(chartBox!.x + setup.target.x, chartBox!.y + setup.target.y, { steps: 3 });

		if (reason === 'pointer-cancel') {
			await page.evaluate(() => {
				const state = window as unknown as { __baronM2CancelPointerId(): number };
				document.querySelector('#chart')!.dispatchEvent(new PointerEvent('pointercancel', {
					bubbles: true,
					pointerId: state.__baronM2CancelPointerId(),
				}));
			});
		} else if (reason === 'window-blur') {
			await page.evaluate(() => window.dispatchEvent(new Event('blur')));
		} else if (reason === 'destroy') {
			await page.evaluate(() => (
				window as unknown as { __baronM2CancelRuntime: { destroy(): void } }
			).__baronM2CancelRuntime.destroy());
		}
		await page.mouse.up();

		const result = await page.evaluate(({ expectedId, destroyed }) => {
			const state = window as unknown as {
				__baronM2CancelRuntime: {
					destroy(): void;
					getOverlay(id: string): unknown;
				};
				__baronM2CancelEvents: Array<Record<string, unknown>>;
			};
			const overlay = destroyed
				? undefined
				: state.__baronM2CancelRuntime.getOverlay(expectedId);
			const events = structuredClone(state.__baronM2CancelEvents);
			if (!destroyed) {
				state.__baronM2CancelRuntime.destroy();
			}
			return { events, overlay };
		}, { expectedId: `m2-cancel-${reason}`, destroyed: reason === 'destroy' });
		const eventTypes = result.events.map((event) => event.type);
		expect(eventTypes).toContain('overlay-drag-started');
		expect(eventTypes).not.toContain('overlay-drag-committed');
		expect(result.events.find((event) => event.type === 'overlay-drag-cancelled'))
			.toEqual(expect.objectContaining({ reason }));
		if (reason === 'validation-error') {
			expect(eventTypes.at(-1)).toBe('scene-error');
		} else {
			expect(eventTypes).not.toContain('scene-error');
		}
		if (reason !== 'destroy') {
			expect(result.overlay).toEqual(setup.before);
		}
	}
});
