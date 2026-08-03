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
