import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');
const allOverlays = loadScene('all-overlays.json');
const m1Scene = loadScene('m1-candle-horizontal-line.json');

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
		{ type: 'overlay-removed', id: createdId },
	]);
	expect(removal.destroyedErrorCode).toBe('RUNTIME_INIT_FAILED');
	expect(removal.eventCountAfterDestroy).toBe(removal.eventCountBeforeDestroy);
	expect(removal.childrenAfterDestroy).toBe(0);
});
