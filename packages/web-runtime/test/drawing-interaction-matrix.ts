import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const SUPPORTED_TYPES = [
	'horizontalRayLine', 'horizontalSegment', 'horizontalStraightLine',
	'verticalRayLine', 'verticalSegment', 'verticalStraightLine',
	'rayLine', 'segment', 'straightLine', 'priceLine',
	'priceChannelLine', 'parallelStraightLine', 'fibonacciLine', 'brush',
	'simpleAnnotation', 'simpleTag',
	'priceMeasurement', 'rectangle', 'arrow', 'crossLine', 'callout', 'text',
] as const;

export const TEXT_TYPES = new Set([
	'simpleTag',
	'simpleAnnotation',
	'callout',
	'text',
]);

export async function loadWorkspaceFixture(kind: 'chart' | 'time-series') {
	const name = kind === 'chart'
		? 'chart-minimal.json'
		: 'time-series-minimal.json';
	return JSON.parse(
		await readFile(
			join(
				process.cwd(),
				'..',
				'..',
				'tests',
				'fixtures',
				'workspaces',
				name,
			),
			'utf8',
		),
	);
}

export async function installWorkspaceRuntime(
	page: Page,
	kind: 'chart' | 'time-series',
	commitMode: 'immediate' | 'host-confirmed' = 'immediate',
): Promise<void> {
	const workspace = await loadWorkspaceFixture(kind);
	await page.goto('/test/fixture.html');
	await page.evaluate(
		async ({ workspace, kind, commitMode }) => {
			const {
				createDrawableWorkspaceRuntime,
				createStandardToolbar,
			} = await import('/src/index.ts');
			const existing = document.querySelector<HTMLElement>('#chart');
			const container = kind === 'chart' && existing !== null
				? existing
				: (() => {
						const created = document.createElement('div');
						created.style.width = '1000px';
						created.style.height = '600px';
						created.id = `chart-${kind}`;
						document.body.prepend(created);
						return created;
					})();
			const toolbarRoot = document.querySelector<HTMLElement>('#toolbar')
				?? (() => {
						const created = document.createElement('div');
						created.id = 'toolbar';
						document.body.append(created);
						return created;
					})();
			const events: Array<Record<string, unknown>> = [];
			const runtime = await createDrawableWorkspaceRuntime(container, workspace, {
				commitMode,
				onEvent: (event) => events.push(event as Record<string, unknown>),
			});
			const toolbar = createStandardToolbar(toolbarRoot, runtime, {
				mainSeriesPresentationControl: 'enabled',
			});
			(window as unknown as Record<string, unknown>).__runtime = runtime;
			(window as unknown as Record<string, unknown>).__toolbar = toolbar;
			(window as unknown as Record<string, unknown>).__events = events;
			(window as unknown as Record<string, unknown>).__chartRoot = container;
		},
		{ workspace, kind, commitMode },
	);
}

export async function settle(page: Page, ms = 60): Promise<void> {
	await page.evaluate(
		(ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
		ms,
	);
}

export async function waitForCommitted(page: Page): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const committed = await page.evaluate(() => {
			const events = (window as unknown as {
				__events: readonly { readonly type: string }[];
			}).__events;
			return events.some((event) => event.type === 'drawing-committed');
		});
		if (committed) {
			return;
		}
		await settle(page, 40);
	}
	throw new Error('Drawing mutation was not committed.');
}

export async function clearDrawings(page: Page): Promise<void> {
	await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				listDrawings(): readonly { readonly id: string }[];
				removeDrawing(id: string): boolean;
			};
		}).__runtime;
		for (const drawing of runtime.listDrawings()) {
			runtime.removeDrawing(drawing.id);
		}
	});
	for (let attempt = 0; attempt < 20; attempt++) {
		const count = await page.evaluate(() => {
			const runtime = (window as unknown as {
				__runtime: {
					listDrawings(): readonly unknown[];
				};
			}).__runtime;
			return runtime.listDrawings().length;
		});
		if (count === 0) {
			break;
		}
		await settle(page, 40);
	}
	const count = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				listDrawings(): readonly unknown[];
			};
		}).__runtime;
		return runtime.listDrawings().length;
	});
	if (count !== 0) {
		throw new Error('Workspace Drawings were not cleared.');
	}
	await page.evaluate(() => {
		(window as unknown as {
			__events: unknown[];
		}).__events.length = 0;
	});
}

export async function completeInteraction(
	page: Page,
	id: string,
	type: string,
): Promise<void> {
	const positions: ReadonlyArray<readonly [number, number]> = [
		[500, 150], [500, 120], [500, 200], [200, 120], [800, 120],
		[700, 250], [300, 350], [650, 420],
	];
	if (type === 'brush') {
		await page.mouse.move(500, 150);
		await page.mouse.down();
		await settle(page, 40);
		await page.mouse.move(720, 430, { steps: 8 });
		await page.mouse.up();
		await settle(page);
		return;
	}
	for (let click = 0; click < 10; click++) {
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
			return;
		}
	}
	throw new Error(`Interaction for ${type} did not complete.`);
}

export interface JourneyResult {
	readonly started: string;
	readonly completed: boolean;
	readonly exportedGeometry: unknown;
	readonly styleUpdated: boolean;
	readonly textUpdated: boolean;
	readonly selected: string | null;
	readonly removed: boolean;
	readonly finalExportCount: number;
}

export async function runBasicJourney(
	page: Page,
	type: string,
): Promise<JourneyResult> {
	await clearDrawings(page);
	await page.evaluate((type) => {
		const runtime = (window as unknown as {
			__runtime: {
				startDrawing(
					type: string,
					options?: unknown,
				): string;
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
			__toolbar: {
				element: HTMLElement;
			};
		}).__toolbar;
		const button = toolbar.element.querySelector<HTMLButtonElement>(
			`[data-overlay-type="${type}"]`,
		);
		if (button === null) {
			throw new Error(`Toolbar button missing: ${type}`);
		}
		button.click();
	}, type);
	const id = await page.evaluate(() =>
		(window as unknown as { __lastStartId: string }).__lastStartId,
	);
	await completeInteraction(page, id, type);
	await waitForCommitted(page);
	const result = await page.evaluate(async ({ id, type }) => {
		const runtime = (window as unknown as {
			__runtime: {
				getDrawing(id: string): {
					readonly id: string;
					readonly type: string;
					readonly geometry: unknown;
					readonly styles: unknown;
				} | undefined;
				updateDrawingStyles(id: string, styles: unknown): unknown;
				updateDrawingText(id: string, text: string): unknown;
				selectDrawing(id: string | null): void;
				getSelectedDrawingId(): string | undefined;
				removeDrawing(id: string): boolean;
				exportWorkspace(): { readonly drawings: { readonly drawings: readonly unknown[] } };
			};
		}).__runtime;
		const drawing = runtime.getDrawing(id)!;
		const exported = runtime.exportWorkspace();
		const styleUpdated = Boolean(
			runtime.updateDrawingStyles(id, {
				...structuredClone(drawing.styles),
				line: { ...structuredClone(drawing.styles.line), size: 3 },
			}),
		);
		const textTypes = new Set(['simpleTag', 'simpleAnnotation', 'callout', 'text']);
		let textUpdated = false;
		if (textTypes.has(drawing.type)) {
			runtime.updateDrawingText(id, 'matrix-text');
			textUpdated = true;
		}
		runtime.selectDrawing(id);
		const selected = runtime.getSelectedDrawingId() ?? null;
		const removed = runtime.removeDrawing(id);
		await new Promise<void>((resolve) => setTimeout(resolve, 80));
		const finalCount = runtime.exportWorkspace().drawings.drawings.length;
		return {
			started: id,
			completed: true,
			exportedGeometry: exported.drawings.drawings.some(
				(entry) => (entry as { id: string }).id === id,
			),
			styleUpdated,
			textUpdated,
			selected,
			removed,
			finalExportCount: finalCount,
		};
	}, { id, type });
	return {
		started: id,
		completed: true,
		exportedGeometry: result.exportedGeometry,
		styleUpdated: result.styleUpdated,
		textUpdated: result.textUpdated,
		selected: result.selected,
		removed: result.removed,
		finalExportCount: result.finalExportCount,
	};
}
