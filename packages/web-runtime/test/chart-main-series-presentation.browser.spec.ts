import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadScene } from './load-scene.js';
import {
	clearDrawings,
	installWorkspaceRuntime,
	settle,
	SUPPORTED_TYPES,
} from './drawing-interaction-matrix.js';

const minimalScene = loadScene('minimal-valid.json');
const m2Scene = loadScene('m2-measurement-linear.json');
const chartWorkspace = JSON.parse(
	await readFile(
		join(process.cwd(), '..', '..', 'tests', 'fixtures', 'workspaces', 'chart-minimal.json'),
		'utf8',
	),
);

const AREA_PRESENTATION = {
	type: 'area',
	value: 'close',
	line: { color: 'rgba(41, 98, 255, 1)', size: 2 },
	backgroundColor: 'rgba(0, 0, 0, 0)',
	smooth: false,
	pointVisible: false,
} as const;

async function installLegacy(page: Page): Promise<void> {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime, createStandardToolbar } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const toolbarRoot = document.querySelector<HTMLElement>('#toolbar')!;
		const runtime = await createKLineSceneRuntime(container, scene);
		for (const overlay of runtime.listOverlays()) {
			runtime.removeOverlay(overlay.id);
		}
		const toolbar = createStandardToolbar(toolbarRoot, runtime, {
			mainSeriesPresentationControl: 'enabled',
		});
		(window as unknown as Record<string, unknown>).__runtime = runtime;
		(window as unknown as Record<string, unknown>).__toolbar = toolbar;
		(window as unknown as Record<string, unknown>).__chartRoot = container;
	}, m2Scene);
}

async function clickToolbarCaptureId(
	page: Page,
	type: string,
): Promise<string> {
	return page.evaluate((type) => {
		const runtime = (window as unknown as {
			__runtime: {
				startDrawing(type: string, options?: unknown): string;
			};
		}).__runtime;
		const original = runtime.startDrawing.bind(runtime);
		runtime.startDrawing = (
			drawingType: string,
			options?: unknown,
		): string => {
			const id = original(drawingType, options);
			(window as unknown as Record<string, unknown>).__lastStartId = id;
			return id;
		};
		const toolbar = (window as unknown as {
			__toolbar: { element: HTMLElement };
		}).__toolbar;
		const button = toolbar.element.querySelector<HTMLButtonElement>(
			`[data-overlay-type="${type}"]`,
		);
		if (button === null) {
			throw new Error(`Toolbar button missing: ${type}`);
		}
		button.click();
		return (window as unknown as { __lastStartId: string }).__lastStartId;
	}, type);
}

async function applyArea(page: Page): Promise<void> {
	await page.evaluate((presentation) => {
		const runtime = (window as unknown as {
			__runtime: {
				setMainSeriesPresentation(
					presentation: unknown,
				): { readonly activeType: string };
			};
		}).__runtime;
		const result = runtime.setMainSeriesPresentation(presentation);
		if (result.activeType !== 'area') {
			throw new Error(`Unexpected active type: ${result.activeType}`);
		}
	}, AREA_PRESENTATION);
}

async function applyCandle(page: Page): Promise<void> {
	await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				setMainSeriesPresentation(
					presentation: unknown,
				): { readonly activeType: string };
			};
		}).__runtime;
		runtime.setMainSeriesPresentation({ type: 'candle_solid' });
	});
}

async function completeAfterArea(
	page: Page,
	id: string,
	type: string,
): Promise<void> {
	await settle(page, 60);
	const positions: ReadonlyArray<readonly [number, number]> = [
		[500, 150], [500, 220], [500, 200], [200, 120], [800, 120],
		[700, 250], [300, 350], [650, 420],
	];
	if (type === 'brush') {
		await page.mouse.move(720, 430, { steps: 8 });
		await page.mouse.up();
		await settle(page, 300);
		return;
	}
	for (let click = 1; click < 10; click++) {
		const position = positions[Math.min(click, positions.length - 1)]!;
		await page.mouse.click(position[0], position[1]);
		await settle(page, 40);
		const done = await page.evaluate((id) => {
			const events = (window as unknown as {
				__events: Array<Record<string, unknown>>;
			}).__events;
			return events.some(
				(event) =>
					event.type === 'drawing-committed' &&
					(event.drawing as { readonly id?: string } | undefined)?.id === id,
			);
		}, id);
		if (done) {
			await settle(page, 300);
			return;
		}
	}
	throw new Error(`Interaction for ${type} did not complete after area switch.`);
}

async function legacyCompleteAfterArea(page: Page, type: string): Promise<void> {
	await settle(page, 60);
	const positions: ReadonlyArray<readonly [number, number]> = [
		[500, 150], [500, 220], [500, 200], [200, 120], [800, 120],
		[700, 250], [300, 350], [650, 420],
	];
	if (type === 'brush') {
		await page.mouse.move(720, 430, { steps: 8 });
		await page.mouse.up();
		await settle(page);
		return;
	}
	for (let click = 1; click < 10; click++) {
		const position = positions[Math.min(click, positions.length - 1)]!;
		await page.mouse.click(position[0], position[1]);
		await settle(page, 40);
		const done = await page.evaluate(() => {
			const runtime = (window as unknown as {
				__runtime: {
					exportScene(): { readonly overlays: readonly unknown[] };
				};
			}).__runtime;
			const overlays = runtime.exportScene().overlays;
			const last = overlays.at(-1) as
				| {
						readonly points?: readonly unknown[];
						readonly anchor?: unknown;
						readonly point?: unknown;
						readonly start?: unknown;
						readonly value?: unknown;
						readonly timestamp?: unknown;
					}
				| undefined;
			return last !== undefined
				&& (
					last.anchor !== undefined
					|| last.point !== undefined
					|| last.start !== undefined
					|| last.value !== undefined
					|| last.timestamp !== undefined
					|| (last.points !== undefined && last.points.length >= 1)
				);
		});
		if (done) {
			return;
		}
	}
	throw new Error('Legacy interaction did not complete after area switch.');
}

for (const type of SUPPORTED_TYPES) {
	test(`@browser chart Workspace ${type} switches presentation during creation`, async ({ page }) => {
		await installWorkspaceRuntime(page, 'chart');
		await clearDrawings(page);
		const id = await clickToolbarCaptureId(page, type);
		await page.mouse.move(500, 150);
		await page.mouse.down();
		await settle(page, 40);
		const snapshotBefore = await page.evaluate(() => {
			const root = (window as unknown as {
				__chartRoot: HTMLElement;
			}).__chartRoot;
			(window as unknown as Record<string, unknown>).__rootIdentity =
				root.firstElementChild;
			const events = (window as unknown as {
				__events: readonly { readonly type: string }[];
			}).__events;
			return {
				eventsLength: events.length,
				pressed: (window as unknown as {
					__toolbar: { element: HTMLElement };
				}).__toolbar.element.querySelector(
					'[aria-pressed="true"]',
				)?.getAttribute('data-overlay-type') ?? null,
			};
		});
		await applyArea(page);
		if (type !== 'brush') {
			await page.mouse.up();
		}
		await completeAfterArea(page, id, type);
		await applyCandle(page);
		const result = await page.evaluate((id) => {
			const runtime = (window as unknown as {
				__runtime: {
					getDrawing(id: string): {
						readonly id: string;
						readonly geometry: unknown;
					} | undefined;
				};
			}).__runtime;
			const root = (window as unknown as {
				__chartRoot: HTMLElement;
			}).__chartRoot;
			const rootIdentity = (window as unknown as {
				__rootIdentity: Element;
			}).__rootIdentity;
			const events = (window as unknown as {
				__events: readonly { readonly type: string }[];
			}).__events;
			const drawing = runtime.getDrawing(id);
			const geometry = drawing?.geometry as {
				readonly points?: readonly unknown[];
				readonly value?: number;
				readonly time?: number;
				readonly point?: { readonly value?: number };
				readonly start?: { readonly value?: number };
			} | undefined;
			const complete = geometry === undefined
				? false
				: geometry.points !== undefined
					? geometry.points.length >= 2
					: geometry.value !== undefined || geometry.time !== undefined
						? true
						: geometry.point?.value !== undefined || geometry.start?.value !== undefined;
			return {
				id: drawing?.id ?? null,
				complete,
				rootSame: root.firstElementChild === rootIdentity,
				presentationEvents: events.filter(
					(event) => event.type === 'main-series-presentation-changed',
				).length,
				candidateEvents: events.filter(
					(event) => event.type === 'drawing-candidate',
				).length,
			};
		}, id);
		expect(result.id).toBe(id);
		expect(result.complete).toBe(true);
		expect(result.rootSame).toBe(true);
		expect(result.presentationEvents).toBeGreaterThanOrEqual(2);
		// 仅 Drawing 创建本身产生一次候选；主序列展示切换不增加候选。
		expect(result.candidateEvents).toBe(1);
	});
}

	for (const type of SUPPORTED_TYPES) {
	test(`@browser Legacy ChartScene ${type} switches presentation during creation`, async ({ page }) => {
		await installLegacy(page);
		await page.evaluate((type) => {
			const toolbar = (window as unknown as {
				__toolbar: { element: HTMLElement };
			}).__toolbar;
			const button = toolbar.element.querySelector<HTMLButtonElement>(
				`[data-overlay-type="${type}"]`,
			);
			if (button === null) {
				throw new Error(`Toolbar button missing: ${type}`);
			}
			button.click();
		}, type);
		await page.mouse.move(500, 150);
		await page.mouse.down();
		await settle(page, 40);
		const overlaysBefore = await page.evaluate(() => {
			const runtime = (window as unknown as {
				__runtime: {
					exportScene(): { readonly overlays: readonly unknown[] };
				};
			}).__runtime;
			return runtime.exportScene().overlays.length;
		});
		await applyArea(page);
		if (type !== 'brush') {
			await page.mouse.up();
		}
		await legacyCompleteAfterArea(page, type);
		await applyCandle(page);
		const result = await page.evaluate(() => {
			const runtime = (window as unknown as {
				__runtime: {
					exportScene(): {
						readonly chart: { readonly candle: { readonly type: string } };
						readonly overlays: readonly { readonly id: string }[];
					};
					listDrawings(): readonly { readonly id: string }[];
				};
			}).__runtime;
			const scene = runtime.exportScene();
			return {
				type: scene.chart.candle.type,
				overlayCount: scene.overlays.length,
				drawingCount: runtime.listDrawings().length,
			};
		});
		expect(result.type).toBe('candle_solid');
		expect(result.overlayCount).toBe(overlaysBefore + 1);
		expect(result.drawingCount).toBeGreaterThan(0);
	});
}

test('@browser Workspace initialization rejects double authority', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const doubleAuthority = structuredClone(chartWorkspace);
	doubleAuthority.scene.document.overlays = [{
		id: 'legacy-overlay',
		type: 'horizontalStraightLine',
		paneId: 'pane-candle',
		visible: true,
		locked: false,
		zLevel: 0,
		mode: 'normal',
		styles: {
			line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
			fill: { color: 'rgba(41, 98, 255, 0.15)' },
			text: {
				color: 'rgba(255, 255, 255, 1)',
				size: 12,
				family: 'Baron Sans',
				weight: 'normal',
				backgroundColor: 'rgba(41, 98, 255, 1)',
				borderColor: 'rgba(41, 98, 255, 1)',
			},
		},
		anchor: { value: 12.55 },
	}];
	const error = await page.evaluate(async (workspace) => {
		const { createDrawableWorkspaceRuntime } = await import('/src/index.ts');
		const container = document.createElement('div');
		container.style.width = '1000px';
		container.style.height = '600px';
		document.body.append(container);
		try {
			await createDrawableWorkspaceRuntime(container, workspace, {
				commitMode: 'immediate',
			});
			return null;
		} catch (caught) {
			return {
				code: (caught as { code?: string }).code,
				path: (caught as { path?: string }).path,
			};
		}
	}, doubleAuthority);
	expect(error?.code).toBe('DRAWABLE_WORKSPACE_DOUBLE_AUTHORITY');
	expect(error?.path).toBe('/scene/document/overlays');
});

test('@browser Workspace keeps confirmed Drawings after Scene replacement and outside range', async ({ page }) => {
	await installWorkspaceRuntime(page, 'chart');
	const result = await page.evaluate((workspace) => {
		const runtime = (window as unknown as {
			__runtime: {
				replaceScene(scene: unknown): unknown;
				exportWorkspace(): {
					readonly drawings: { readonly drawings: readonly unknown[] };
				};
			};
		}).__runtime;
		const before = JSON.stringify(runtime.exportWorkspace().drawings.drawings);
		const next = structuredClone(workspace.scene.document);
		next.period = { type: 'week', span: 1 };
		runtime.replaceScene(next);
		const after = JSON.stringify(runtime.exportWorkspace().drawings.drawings);
		return { unchanged: before === after };
	}, chartWorkspace);
	expect(result.unchanged).toBe(true);
});

test('@browser Workspace rejects logarithmic scale when a Drawing value is non-positive', async ({ page }) => {
	const workspaceWithZero = structuredClone(chartWorkspace);
	workspaceWithZero.drawings.drawings[0].geometry.value = 0;
	await page.goto('/test/fixture.html');
	await page.evaluate(async (workspace) => {
		const { createDrawableWorkspaceRuntime } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const runtime = await createDrawableWorkspaceRuntime(container, workspace, {
			commitMode: 'immediate',
		});
		(window as unknown as Record<string, unknown>).__runtime = runtime;
	}, workspaceWithZero);
	const result = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				setValueAxisScale(scale: string): Promise<unknown>;
				listDrawings(): readonly unknown[];
			};
		}).__runtime;
		const before = JSON.stringify(runtime.listDrawings());
		return runtime.setValueAxisScale('logarithmic')
			.then(() => 'no-error')
			.catch((error: { message?: string }) => error.message ?? String(error))
			.then((message) => ({ message, unchanged: before === JSON.stringify(runtime.listDrawings()) }));
	});
	expect(result.message).toContain('non-positive');
	expect(result.unchanged).toBe(true);
});
