import { expect, test, type Page } from '@playwright/test';

import { loadScene } from './load-scene.js';

const chartWorkspace = JSON.parse(
	await readFixture('workspaces/chart-minimal.json'),
);
const timeSeriesWorkspace = JSON.parse(
	await readFixture('workspaces/time-series-minimal.json'),
);
const allDrawings = JSON.parse(
	await readFixture('drawings/all-drawings.json'),
);

async function readFixture(path: string): Promise<string> {
	const { readFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	return readFile(join(process.cwd(), '..', '..', 'tests', 'fixtures', path), 'utf8');
}

const SNAPSHOT_BUILDER = `
window.__baronSnapshots = function (types, paneRole) {
	return types.map(function (type, index) {
		var geometry = { value: 12.55 };
		switch (type) {
			case 'verticalStraightLine':
				geometry = { time: 1784822400000 };
				break;
			case 'horizontalRayLine':
			case 'horizontalSegment':
				geometry = { value: 12.55, startTime: 1784736000000, endTime: 1784908800000 };
				break;
			case 'verticalRayLine':
			case 'verticalSegment':
				geometry = { time: 1784822400000, startValue: 12.34, endValue: 12.74 };
				break;
			case 'rayLine':
			case 'segment':
			case 'straightLine':
			case 'fibonacciLine':
			case 'priceChannelLine':
			case 'parallelStraightLine':
			case 'brush':
				geometry = {
					points: [
						{ timestamp: 1784736000000, granularity: { type: 'day', span: 1 }, value: 12.34 },
						{ timestamp: 1784822400000, granularity: { type: 'day', span: 1 }, value: 12.55 },
						{ timestamp: 1784908800000, granularity: { type: 'day', span: 1 }, value: 12.74 }
					]
				};
				if (type !== 'brush' && type !== 'priceChannelLine' && type !== 'parallelStraightLine') {
					geometry.points = geometry.points.slice(0, 2);
				}
				break;
			case 'simpleTag':
				geometry = { value: 12.55, text: 'tag' };
				break;
			case 'simpleAnnotation':
			case 'callout':
			case 'text':
				geometry = {
					point: { timestamp: 1784822400000, granularity: { type: 'day', span: 1 }, value: 12.55 },
					text: type + '-content'
				};
				break;
			case 'crossLine':
				geometry = {
					point: { timestamp: 1784822400000, granularity: { type: 'day', span: 1 }, value: 12.55 }
				};
				break;
			case 'rectangle':
			case 'arrow':
			case 'priceMeasurement':
				geometry = {
					start: { timestamp: 1784736000000, granularity: { type: 'day', span: 1 }, value: 12.34 },
					end: { timestamp: 1784908800000, granularity: { type: 'day', span: 1 }, value: 12.74 }
				};
				break;
		}
		return {
			id: 'port-' + type + '-' + index,
			type: type,
			target: { paneRole: paneRole, yAxisRole: 'primary' },
			geometry: geometry,
			styles: {
				line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
				fill: { color: 'rgba(41, 98, 255, 0.15)' },
				text: {
					color: 'rgba(255, 255, 255, 1)', size: 12, family: 'Baron Sans',
					weight: 'normal', backgroundColor: 'rgba(41, 98, 255, 1)',
					borderColor: 'rgba(41, 98, 255, 1)'
				}
			},
			locked: false, visible: true, zLevel: index, mode: 'normal'
		};
	});
};
window.__baronRequest = function (type, index, paneRole) {
	return {
		id: 'port-' + type + '-' + index,
		type: type,
		target: { paneRole: paneRole, yAxisRole: 'primary' },
		styles: {
			line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
			fill: { color: 'rgba(41, 98, 255, 0.15)' },
			text: {
				color: 'rgba(255, 255, 255, 1)', size: 12, family: 'Baron Sans',
				weight: 'normal', backgroundColor: 'rgba(41, 98, 255, 1)',
				borderColor: 'rgba(41, 98, 255, 1)'
			}
		},
		text: type === 'simpleTag' || type === 'simpleAnnotation' || type === 'callout' || type === 'text' ? type + '-content' : undefined
	};
};
window.__baronGeometryComplete = function (geometry) {
	if (geometry && Array.isArray(geometry.points)) {
		return geometry.points.length >= 2;
	}
	if (geometry && geometry.point) {
		return geometry.point.value !== undefined || geometry.point.timestamp !== undefined;
	}
	if (geometry && geometry.start) {
		return geometry.start.value !== undefined || geometry.start.timestamp !== undefined;
	}
	return geometry !== undefined
		&& (geometry.value !== undefined || geometry.time !== undefined);
};
`;

const SUPPORTED_TYPES = [
	'horizontalRayLine', 'horizontalSegment', 'horizontalStraightLine',
	'verticalRayLine', 'verticalSegment', 'verticalStraightLine',
	'rayLine', 'segment', 'straightLine', 'priceLine',
	'priceChannelLine', 'parallelStraightLine', 'fibonacciLine', 'brush',
	'simpleAnnotation', 'simpleTag',
	'priceMeasurement', 'rectangle', 'arrow', 'crossLine', 'callout', 'text',
] as const;

async function installWorkspace(
	page: Page,
	kind: 'chart' | 'time-series',
): Promise<void> {
	await page.addInitScript(SNAPSHOT_BUILDER);
	await page.goto('/test/fixture.html');
	await page.evaluate(
		async ({ kind, chartWorkspace, timeSeriesWorkspace }) => {
			const { KLineChartsSceneAdapter, TimeSeriesChartsAdapter } =
				await import('/src/index.ts');
			const container = document.querySelector<HTMLElement>(
				kind === 'chart' ? '#chart' : '#chart-time-series',
			)!;
			const adapter = kind === 'chart'
				? await KLineChartsSceneAdapter.createWorkspace(
						container,
						chartWorkspace,
					)
				: await TimeSeriesChartsAdapter.createWorkspace(
						container,
						timeSeriesWorkspace,
					);
			(window as unknown as Record<string, unknown>).__adapter = adapter;
			(window as unknown as Record<string, unknown>).__kind = kind;
		},
		{ kind, chartWorkspace, timeSeriesWorkspace },
	);
}

async function settle(page: Page): Promise<void> {
	await page.evaluate(
		() => new Promise<void>((resolve) => setTimeout(resolve, 40)),
	);
}

async function completeDrawing(
	page: Page,
	id: string,
	drawingMode: string,
	totalStep: number,
): Promise<void> {
	const positions: ReadonlyArray<readonly [number, number]> = [
		[220, 260], [480, 340], [740, 300], [400, 430], [600, 380], [300, 320],
		[700, 450], [520, 250],
	];
	if (drawingMode === 'continuous') {
		await page.mouse.move(220, 260);
		await page.mouse.down();
		await settle(page);
		await page.mouse.move(720, 430, { steps: 6 });
		await page.mouse.up();
		await settle(page);
		return;
	}
	let clicks = 0;
	while (clicks < 10) {
		const position = positions[Math.min(clicks, positions.length - 1)]!;
		await page.mouse.click(position[0], position[1]);
		clicks += 1;
		await settle(page);
		const done = await page.evaluate((id) => {
			const adapter = (window as unknown as {
				__adapter: {
					getDrawing(id: string): { readonly geometry: unknown } | undefined;
				};
			}).__adapter;
			const drawing = adapter.getDrawing(id);
			return drawing !== undefined
				&& (window as unknown as {
					__baronGeometryComplete(geometry: unknown): boolean;
				}).__baronGeometryComplete(drawing.geometry);
		}, id);
		if (done) {
			return;
		}
	}
	throw new Error(`Drawing ${id} did not complete.`);
}

function geometryComplete(geometry: unknown): boolean {
	const value = geometry as {
		readonly points?: readonly unknown[];
		readonly value?: unknown;
		readonly time?: unknown;
	};
	return value.points !== undefined
		? value.points.length >= 2
		: value.value !== undefined || value.time !== undefined;
}

for (const kind of ['chart', 'time-series'] as const) {
	test.describe(`DrawingEnginePort ${kind}`, () => {
		test('@browser restores, lists and edits all 22 Drawing types through one contract', async ({ page }) => {
			await installWorkspace(page, kind);
			const paneRole = kind === 'chart' ? 'candle' : 'time-series';
			const result = await page.evaluate(
				({ types, paneRole }) => {
					const adapter = (window as unknown as {
						__adapter: {
							restoreDrawings(drawings: unknown[]): void;
							listDrawings(): readonly unknown[];
							getDrawing(id: string): unknown;
							updateDrawingStyles(id: string, styles: unknown): unknown;
							updateDrawingText(id: string, text: string): unknown;
							updateDrawingLocked(id: string, locked: boolean): { readonly locked: boolean };
							removeDrawing(id: string): boolean;
							subscribeDrawingEvents(
								listener: (event: { readonly type: string; readonly id: string }) => void,
							): () => void;
							projectToPixel(
								anchor: { readonly timestamp: number; readonly value: number },
								paneRole: string,
							): { readonly x: number; readonly y: number };
							unprojectFromPixel(
								point: { readonly x: number; readonly y: number },
								paneRole: string,
							): { readonly timestamp?: number; readonly value?: number };
						};
					}).__adapter;
					adapter.restoreDrawings(
						(window as unknown as { __baronSnapshots(types: string[], paneRole: string): unknown[] })
							.__baronSnapshots(types, paneRole),
					);
					const events: string[] = [];
					adapter.subscribeDrawingEvents((event) => {
						events.push(`${event.type}:${event.id}`);
					});
					const listed = adapter.listDrawings();
					const first = listed[0] as { readonly id: string };
					const styles = (adapter.getDrawing(first.id) as {
						readonly styles: unknown;
					}).styles;
					adapter.updateDrawingStyles(first.id, styles);
					const locked = adapter.updateDrawingLocked(first.id, true).locked;
					adapter.updateDrawingLocked(first.id, false);
					const textId = types.find(
						(type) => type === 'simpleTag' || type === 'text' || type === 'callout',
					);
					let textUpdated = false;
					if (textId !== undefined) {
						const id = `port-${textId}-${types.indexOf(textId)}`;
						adapter.updateDrawingText(id, 'new-text');
						textUpdated = true;
					}
					const removed = adapter.removeDrawing(first.id);
					const projected = adapter.projectToPixel(
						{ timestamp: 1784822400000, value: 12.55 },
						paneRole,
					);
					const unprojected = adapter.unprojectFromPixel(
						{ x: projected.x, y: projected.y },
						paneRole,
					);
					return {
						listedCount: listed.length,
						removed,
						textUpdated,
						locked,
						events,
						projected,
						unprojected,
					};
				},
				{ types: SUPPORTED_TYPES, paneRole },
			);
			expect(result.listedCount).toBe(22);
			expect(result.removed).toBe(true);
			expect(result.locked).toBe(true);
			expect(result.events).toContain('removed:port-horizontalRayLine-0');
			expect(result.projected.x).toBeGreaterThan(0);
			expect(result.projected.y).toBeGreaterThan(0);
			if (kind === 'chart') {
				expect(result.unprojected.timestamp).toBe(1784822400000);
			}
			expect(Math.abs(result.unprojected.value! - 12.55)).toBeLessThan(0.05);
		});

		test('@browser right-click keeps the Drawing and leaves contextmenu uncancelled', async ({ page }) => {
			await installWorkspace(page, kind);
			const paneRole = kind === 'chart' ? 'candle' : 'time-series';
			const point = await page.evaluate(({ paneRole }) => {
				const adapter = (window as unknown as {
					__adapter: {
						restoreDrawings(drawings: unknown[]): void;
						hitTestDrawing(point: { readonly x: number; readonly y: number }): string | null;
					};
				}).__adapter;
				adapter.restoreDrawings(
					(window as unknown as {
						__baronSnapshots(types: string[], paneRole: string): unknown[];
					}).__baronSnapshots(['horizontalStraightLine'], paneRole),
				);
				for (let y = 10; y <= 580; y += 2) {
					for (let x = 80; x <= 900; x += 8) {
						if (adapter.hitTestDrawing({ x, y }) !== null) {
							return { x, y };
						}
					}
				}
				return null;
			}, { paneRole });
			expect(point).not.toBeNull();
			const canvas = page.locator(
				kind === 'chart' ? '#chart canvas' : '#chart-time-series canvas',
			).nth(1);
			const contextMenuAllowed = await canvas.evaluate((element, input) => {
				const rect = document.querySelector<HTMLElement>(input.targetId)!.getBoundingClientRect();
				const init = {
					bubbles: true,
					cancelable: true,
					clientX: rect.left + input.hitPoint.x,
					clientY: rect.top + input.hitPoint.y,
					button: 2,
				};
				element.dispatchEvent(new MouseEvent('mousedown', init));
				return element.dispatchEvent(new MouseEvent('contextmenu', init));
			}, {
				hitPoint: point!,
				targetId: kind === 'chart' ? '#chart' : '#chart-time-series',
			});
			expect(contextMenuAllowed).toBe(true);
			const container = page.locator(
				kind === 'chart' ? '#chart' : '#chart-time-series',
			);
			await container.scrollIntoViewIfNeeded();
			const containerBox = await container.boundingBox();
			expect(containerBox).not.toBeNull();
			await page.mouse.click(
				containerBox!.x + point!.x,
				containerBox!.y + point!.y,
				{ button: 'right' },
			);
			const drawingCount = await page.evaluate(() => (window as unknown as {
				__adapter: { listDrawings(): readonly unknown[] };
			}).__adapter.listDrawings().length);
			expect(drawingCount).toBe(1);
		});

		test('@browser starts and completes every Drawing type through engine interaction', async ({ page }) => {
			await installWorkspace(page, kind);
			const paneRole = kind === 'chart' ? 'candle' : 'time-series';
			await page.evaluate(() => {
				const adapter = (window as unknown as {
					__adapter: {
						restoreDrawings(drawings: readonly unknown[]): void;
					};
				}).__adapter;
				adapter.restoreDrawings([]);
			});
			for (const type of SUPPORTED_TYPES) {
				await page.evaluate(() => {
					const adapter = (window as unknown as {
						__adapter: {
							restoreDrawings(drawings: readonly unknown[]): void;
						};
					}).__adapter;
					adapter.restoreDrawings([]);
				});
				await page.evaluate(
					({ type, paneRole }) => {
						const adapter = (window as unknown as {
							__adapter: {
								startDrawing(request: unknown): string;
							};
						}).__adapter;
						adapter.startDrawing(
							(window as unknown as {
								__baronRequest(type: string, index: number, paneRole: string): unknown;
							}).__baronRequest(type, 0, paneRole),
						);
					},
					{ type, paneRole },
				);
				const id = `port-${type}-0`;
				await completeDrawing(
					page,
					id,
					type === 'brush' ? 'continuous' : 'step',
					2,
				);
				const snapshot = await page.evaluate((id) => {
					const adapter = (window as unknown as {
						__adapter: {
							getDrawing(id: string): {
								readonly id: string;
								readonly geometry: unknown;
							} | undefined;
						};
					}).__adapter;
					return adapter.getDrawing(id);
				}, id);
				expect(snapshot?.id).toBe(id);
				const complete = await page.evaluate((geometry) => {
					return (window as unknown as {
						__baronGeometryComplete(geometry: unknown): boolean;
					}).__baronGeometryComplete(geometry);
				}, snapshot?.geometry);
				expect(complete).toBe(true);
			}
		});
	});
}
