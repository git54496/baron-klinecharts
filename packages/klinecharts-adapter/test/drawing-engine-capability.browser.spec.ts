import { expect, test, type Page } from '@playwright/test';
import type { OverlayCreate } from 'klinecharts';

import { loadScene } from './load-scene.js';

const klineScene = loadScene('all-overlays.json');

/**
 * Task 1 校准用的 22 种工具集合，与 SUPPORTED_OVERLAYS 保持一致。
 * fixture all-overlays.json 只有 21 种，这里显式补齐 priceMeasurement。
 */
const SUPPORTED_TYPES = [
	'horizontalRayLine',
	'horizontalSegment',
	'horizontalStraightLine',
	'verticalRayLine',
	'verticalSegment',
	'verticalStraightLine',
	'rayLine',
	'segment',
	'straightLine',
	'priceLine',
	'priceChannelLine',
	'parallelStraightLine',
	'fibonacciLine',
	'brush',
	'simpleAnnotation',
	'simpleTag',
	'priceMeasurement',
	'rectangle',
	'arrow',
	'crossLine',
	'callout',
	'text',
] as const;

const KLINE_VALUES = [12.34, 12.55, 12.74] as const;
const ZERO_NEGATIVE_VALUES = [0, -3.2, 12.74] as const;

/**
 * 编译期证据：KLineCharts 10.0.0 的 OverlayCreate 没有 yAxisId 字段，
 * v1 Drawing 只能绑定 pane 的 primary 数值轴。
 */
type OverlayCreateHasNoYAxisId = 'yAxisId' extends keyof OverlayCreate ? never : true;
const _overlayCreateHasNoYAxisId: OverlayCreateHasNoYAxisId = true;
void _overlayCreateHasNoYAxisId;

declare global {
	interface Window {
		__baronKChart?: unknown;
		__baronTSChart?: unknown;
		__baronKModule?: unknown;
		__baronTSModule?: unknown;
		__baronTSPaneId?: string;
		__baronBuildOverlay?: (
			type: string,
			index: number,
			paneId: string,
			values: readonly number[],
		) => Record<string, unknown>;
		__baronBuildDrawingRequest?: (
			type: string,
			index: number,
			paneId: string,
			onDrawEnd?: () => void,
		) => Record<string, unknown>;
		__baronRunCreateUpdateRemove?: (
			chart: unknown,
			types: readonly string[],
			paneId: string,
			values: readonly number[],
		) => Array<{
			readonly type: string;
			readonly created: boolean;
			readonly updated: boolean;
			readonly removed: boolean;
		}>;
		__baronCrosshairCount?: number;
		__baronDrawEnds?: number;
		__baronDispose?: () => void;
	}
}

/** 只在浏览器环境安装的原始引擎校准 harness，不导入产品 Adapter。 */
const OVERLAY_BUILDER_SOURCE = `
window.__baronBuildOverlay = function (type, index, paneId, values) {
	var v0 = values[0];
	var v1 = values[1];
	var v2 = values[2];
	var t0 = 1784736000000;
	var t1 = 1784822400000;
	var t2 = 1784908800000;
	var base = {
		id: 'overlay-' + type + '-' + index,
		name: type,
		paneId: paneId,
		lock: false,
		visible: true,
		zLevel: index,
		mode: 'normal',
		styles: {
			line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
			rect: {
				style: 'stroke_fill',
				color: 'rgba(41, 98, 255, 0.15)',
				borderColor: 'rgba(41, 98, 255, 1)',
				borderSize: 1,
				borderStyle: 'solid',
				borderDashedValue: [4, 4]
			},
			polygon: {
				style: 'stroke_fill',
				color: 'rgba(41, 98, 255, 0.15)',
				borderColor: 'rgba(41, 98, 255, 1)',
				borderSize: 1,
				borderStyle: 'solid',
				borderDashedValue: [4, 4]
			},
			text: {
				style: 'stroke_fill',
				color: 'rgba(255, 255, 255, 1)',
				size: 12,
				family: 'Baron Sans',
				weight: 'normal',
				backgroundColor: 'rgba(41, 98, 255, 1)',
				borderColor: 'rgba(41, 98, 255, 1)',
				borderSize: 1,
				borderStyle: 'solid',
				borderDashedValue: [4, 4]
			}
		}
	};
	function withExtend(type, points) {
		var value = Object.assign({}, base, { points: points });
		if (type === 'simpleAnnotation' || type === 'simpleTag' || type === 'callout' || type === 'text' || type === 'rectangle' || type === 'arrow' || type === 'priceMeasurement') {
			value.extendData = type + '-content';
		}
		return value;
	}
	switch (type) {
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag':
			return withExtend(type, [{ value: v1 }]);
		case 'verticalStraightLine':
			return withExtend(type, [{ timestamp: t0 }]);
		case 'horizontalRayLine':
		case 'horizontalSegment':
			return withExtend(type, [{ timestamp: t1, value: v1 }, { timestamp: t2, value: v1 }]);
		case 'verticalRayLine':
		case 'verticalSegment':
			return withExtend(type, [{ timestamp: t1, value: v0 }, { timestamp: t1, value: v2 }]);
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
			return withExtend(type, [{ timestamp: t1, value: v1 }, { timestamp: t2, value: v2 }]);
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			return withExtend(type, [
				{ timestamp: t0, value: v0 },
				{ timestamp: t1, value: v1 },
				{ timestamp: t2, value: v2 }
			]);
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
		case 'crossLine':
			return withExtend(type, [{ timestamp: t1, value: v1 }]);
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			return withExtend(type, [{ timestamp: t0, value: v0 }, { timestamp: t2, value: v2 }]);
		default:
			return withExtend(type, []);
	}
};
window.__baronBuildDrawingRequest = function (type, index, paneId, onDrawEnd) {
	var base = {
		id: 'drawing-' + type + '-' + index,
		name: type,
		paneId: paneId,
		lock: false,
		visible: true,
		zLevel: index,
		mode: 'normal',
		styles: {
			line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
			rect: {
				style: 'stroke_fill',
				color: 'rgba(41, 98, 255, 0.15)',
				borderColor: 'rgba(41, 98, 255, 1)',
				borderSize: 1,
				borderStyle: 'solid',
				borderDashedValue: [4, 4]
			},
			polygon: {
				style: 'stroke_fill',
				color: 'rgba(41, 98, 255, 0.15)',
				borderColor: 'rgba(41, 98, 255, 1)',
				borderSize: 1,
				borderStyle: 'solid',
				borderDashedValue: [4, 4]
			},
			text: {
				style: 'stroke_fill',
				color: 'rgba(255, 255, 255, 1)',
				size: 12,
				family: 'Baron Sans',
				weight: 'normal',
				backgroundColor: 'rgba(41, 98, 255, 1)',
				borderColor: 'rgba(41, 98, 255, 1)',
				borderSize: 1,
				borderStyle: 'solid',
				borderDashedValue: [4, 4]
			}
		},
		onDrawEnd: onDrawEnd
	};
	if (type === 'simpleAnnotation' || type === 'simpleTag' || type === 'callout' || type === 'text') {
		base.extendData = type + '-content';
	}
	return base;
};
window.__baronRunCreateUpdateRemove = function (chart, types, paneId, values) {
	var results = [];
	for (var index = 0; index < types.length; index++) {
		var type = types[index];
		var overlay = window.__baronBuildOverlay(type, index, paneId, values);
		var created = chart.createOverlay(overlay);
		var createdId = Array.isArray(created) ? created[0] : created;
		var createdOk = createdId !== undefined && createdId !== null
			&& chart.getOverlays().some(function (item) { return item.id === createdId; });
		var updated = false;
		if (createdId !== undefined && createdId !== null) {
			updated = chart.overrideOverlay(Object.assign({}, overlay, {
				id: createdId,
				styles: Object.assign({}, overlay.styles, {
					line: Object.assign({}, overlay.styles.line, { color: 'rgba(255, 255, 255, 1)' })
				})
			}));
		}
		var removed = createdId === undefined || createdId === null
			? false
			: chart.removeOverlay({ id: createdId });
		results.push({
			type: type,
			created: createdOk,
			updated: Boolean(updated),
			removed: removed
		});
	}
	return results;
};
`;

async function installKLineHarness(page: Page): Promise<void> {
	await page.evaluate(async (scene) => {
		const { createEngine } = await import('/src/engine.ts');
		const { registerProjectOverlays } = await import('/src/extensions/register.ts');
		const candidate = structuredClone(scene);
		candidate.runtime.runtimeVersion = '0.2.0';
		for (const pane of candidate.panes) {
			pane.yAxes = pane.yAxes.map((axis) => ({ ...axis, scale: 'linear' }));
		}
		const container = document.querySelector<HTMLElement>('#chart');
		if (container === null) {
			throw new Error('chart container missing');
		}
		const { chart, module } = await createEngine(container, candidate);
		registerProjectOverlays(module.registerOverlay);
		window.__baronKChart = chart;
		window.__baronKModule = module;
		let crosshairCount = 0;
		chart.subscribeAction('onCrosshairChange', () => {
			crosshairCount += 1;
			window.__baronCrosshairCount = crosshairCount;
		});
		window.__baronDispose = () => {
			module.dispose(container);
			container.replaceChildren();
		};
	}, klineScene);
}

async function installTimeSeriesHarness(
	page: Page,
	values: readonly number[] = KLINE_VALUES,
): Promise<void> {
	await page.evaluate(async (values) => {
		const module = await import('/node_modules/.vite/deps/klinecharts.js');
		const { registerProjectOverlays } = await import('/src/extensions/register.ts');
		const { toKLineChartsTimeSeriesOptions } = await import('/src/conversion/chart-options.ts');
		const {
			TIME_SERIES_PANE_ID,
			TIME_SERIES_Y_AXIS_ID,
			toTimeSeriesIndicatorCreate,
			timeSeriesIndicatorTemplate,
		} = await import('/src/time-series/indicator.ts');
		const timestamp = [1784736000000, 1784822400000, 1784908800000] as const;
		const scene = {
			timeSeries: true,
			period: { type: 'day', span: 1 },
			series: [
				{
					id: 'series-a',
					name: 'Series A',
					type: 'line',
					unit: 'unit',
					precision: 2,
					visible: true,
					style: {
						color: 'rgba(96, 165, 250, 1)',
						size: 2,
						style: 'solid' as const,
					},
				},
			],
			data: [
				{ timestamp: timestamp[0], values: { 'series-a': values[0] } },
				{ timestamp: timestamp[1], values: { 'series-a': values[1] } },
				{ timestamp: timestamp[2], values: { 'series-a': values[2] } },
			],
			render: {
				width: 1200,
				height: 480,
				background: 'rgba(255, 255, 255, 1)',
				fontFamily: 'Baron Sans',
				deviceScaleFactor: 1,
				timeoutMs: 10000,
			},
			chart: {
				locale: 'zh-CN',
				timezone: 'Asia/Shanghai',
				layout: {
					backgroundColor: 'rgba(255, 255, 255, 1)',
					textColor: 'rgba(34, 34, 34, 1)',
					fontFamily: 'Baron Sans',
					fontSize: 12,
				},
				grid: {
					horizontalColor: 'rgba(225, 226, 230, 1)',
					verticalColor: 'rgba(225, 226, 230, 1)',
				},
				thousandsSeparator: ',',
				decimalFold: { enabled: false, threshold: 8 },
				zoomAnchor: 'cursor',
				dateFormat: 'yyyy-MM-dd',
				largeNumberFormat: 'western',
			},
		} as const;
		const container = document.querySelector<HTMLElement>('#chart');
		if (container === null) {
			throw new Error('chart container missing');
		}
		const chart = module.init(
			container,
			toKLineChartsTimeSeriesOptions({
				locale: scene.chart.locale,
				timezone: scene.chart.timezone,
				layout: scene.chart.layout,
				grid: scene.chart.grid,
				thousandsSeparator: scene.chart.thousandsSeparator,
				decimalFold: scene.chart.decimalFold,
				zoomAnchor: scene.chart.zoomAnchor,
				dateFormat: scene.chart.dateFormat,
				fontFamily: scene.chart.layout.fontFamily,
				fontSize: scene.chart.layout.fontSize,
			} as never),
		);
		if (chart === null) {
			throw new Error('chart is null');
		}
		const root = container.firstElementChild;
		if (!(root instanceof HTMLElement)) {
			throw new Error('chart root is missing');
		}
		root.style.touchAction = 'none';
		chart.setSymbol({
			ticker: '@baron1996/time-series-scene',
			pricePrecision: 2,
			volumePrecision: 0,
		});
		chart.setPeriod(structuredClone(scene.period as never));
		chart.setDataLoader({
			getBars({ type, callback }): void {
				callback(
					type === 'init'
						? [
							{
								timestamp: timestamp[0],
								open: 0,
								high: 0,
								low: 0,
								close: 0,
								volume: 0,
								__baronTimeSeriesValues: { 'series-a': values[0] },
							},
							{
								timestamp: timestamp[1],
								open: 0,
								high: 0,
								low: 0,
								close: 0,
								volume: 0,
								__baronTimeSeriesValues: { 'series-a': values[1] },
							},
							{
								timestamp: timestamp[2],
								open: 0,
								high: 0,
								low: 0,
								close: 0,
								volume: 0,
								__baronTimeSeriesValues: { 'series-a': values[2] },
							},
						]
						: [],
					{
						forward: false,
						backward: false,
					},
				);
			},
		});
		registerProjectOverlays(module.registerOverlay);
		module.registerIndicator(timeSeriesIndicatorTemplate);
		for (const entry of scene.series as readonly { readonly [key: string]: unknown }[]) {
			chart.createIndicator(toTimeSeriesIndicatorCreate(entry as never), true);
		}
		chart.setPaneOptions({
			id: 'candle_pane',
			height: 0,
			minHeight: 0,
			order: 0,
			state: 'minimize',
			dragEnabled: false,
		});
		chart.setPaneOptions({
			id: TIME_SERIES_PANE_ID,
			height: Math.max(container.clientHeight, 240),
			minHeight: 120,
			order: 1,
			state: 'normal',
			dragEnabled: false,
		});
		chart.overrideYAxis({
			id: TIME_SERIES_Y_AXIS_ID,
			paneId: TIME_SERIES_PANE_ID,
			name: 'normal',
			position: 'right',
			inside: false,
			scrollZoomEnabled: false,
			gap: { top: 0.12, bottom: 0.08 },
		});
		window.__baronTSChart = chart;
		window.__baronTSModule = module;
		window.__baronTSPaneId = TIME_SERIES_PANE_ID;
		window.__baronDispose = () => {
			module.dispose(container);
			container.replaceChildren();
		};
	}, values);
}

function settle(page: Page): Promise<void> {
	return page.evaluate(
		() => new Promise<void>((resolve) => setTimeout(resolve, 40)),
	);
}

async function setKLineArea(page: Page): Promise<void> {
	await page.evaluate(() => {
		const chart = window.__baronKChart as {
			setStyles(value: Record<string, unknown>): void;
		};
		chart.setStyles({
			candle: {
				type: 'area',
				area: {
					lineColor: 'rgba(41, 98, 255, 1)',
					lineSize: 2,
					value: 'close',
					backgroundColor: 'rgba(0, 0, 0, 0)',
					smooth: false,
					point: { show: false, animation: false },
				},
			},
		});
	});
}

for (const type of SUPPORTED_TYPES) {
	test(`@browser K线原始引擎 ${type} 支持 create/update/remove`, async ({ page }) => {
		await page.addInitScript(OVERLAY_BUILDER_SOURCE);
		await page.goto('/test/fixture.html');
		await installKLineHarness(page);
		const result = await page.evaluate((type) => {
			const chart = window.__baronKChart as {
				createOverlay(value: unknown): unknown;
			};
			const paneId = 'candle_pane';
			const overlay = window.__baronBuildOverlay!(type, 0, paneId, [12.34, 12.55, 12.74]);
			const created = chart.createOverlay(overlay);
			const createdId = Array.isArray(created) ? created[0] : created;
			const createdOk = createdId !== undefined && createdId !== null
				&& (window.__baronKChart as { getOverlays(): Array<{ readonly id: string }> })
					.getOverlays()
					.some((item) => item.id === createdId);
			let updated = false;
			if (createdId !== undefined && createdId !== null) {
				updated = (window.__baronKChart as {
					overrideOverlay(value: Record<string, unknown>): boolean;
				}).overrideOverlay({
					...overlay,
					id: createdId,
					styles: {
						...overlay.styles,
						line: { ...overlay.styles.line, color: 'rgba(255, 255, 255, 1)' },
					},
				});
			}
			const removed = createdId === undefined || createdId === null
				? false
				: (window.__baronKChart as { removeOverlay(value: { id: string }): boolean })
					.removeOverlay({ id: createdId });
			return { created: createdOk, updated: Boolean(updated), removed };
		}, type);
		expect(result.created).toBe(true);
		expect(result.updated).toBe(true);
		expect(result.removed).toBe(true);
	});

	test(`@browser TimeSeries 原始引擎 ${type} 支持 create/update/remove`, async ({ page }) => {
		await page.addInitScript(OVERLAY_BUILDER_SOURCE);
		await page.goto('/test/fixture.html');
		await installTimeSeriesHarness(page);
		const result = await page.evaluate((type) => {
			const chart = window.__baronTSChart as {
				createOverlay(value: unknown): unknown;
				getOverlays(): Array<{ readonly id: string }>;
				overrideOverlay(value: Record<string, unknown>): boolean;
				removeOverlay(value: { readonly id: string }): boolean;
			};
			const paneId = window.__baronTSPaneId!;
			const overlay = window.__baronBuildOverlay!(type, 0, paneId, [12.34, 12.55, 12.74]);
			const created = chart.createOverlay(overlay as never);
			const createdId = Array.isArray(created) ? created[0] : created;
			const createdOk = createdId !== undefined && createdId !== null
				&& chart.getOverlays().some((item) => item.id === createdId);
			let updated = false;
			if (createdId !== undefined && createdId !== null) {
				updated = chart.overrideOverlay({
					...overlay,
					id: createdId,
					styles: {
						...overlay.styles,
						line: { ...overlay.styles.line, color: 'rgba(255, 255, 255, 1)' },
					},
				} as never);
			}
			const removed = createdId === undefined || createdId === null
				? false
				: chart.removeOverlay({ id: createdId });
			return { created: createdOk, updated: Boolean(updated), removed };
		}, type);
		expect(result.created).toBe(true);
		expect(result.updated).toBe(true);
		expect(result.removed).toBe(true);
	});
}

for (const type of SUPPORTED_TYPES) {
	test(`@browser K线 ${type} 创建中 candle→area→candle 连续`, async ({ page }) => {
		await page.addInitScript(OVERLAY_BUILDER_SOURCE);
		await page.goto('/test/fixture.html');
		await installKLineHarness(page);
		const meta = await page.evaluate((type) => {
			const chart = window.__baronKChart as {
				createOverlay(value: Record<string, unknown>): unknown;
				getOverlays(): Array<{
					readonly id: string;
					readonly drawingMode?: string;
					readonly totalStep?: number;
					readonly currentStep?: number;
				}>;
			};
			let drawEnds = 0;
			window.__baronDrawEnds = 0;
			const id = `mid-${type}`;
			const request = window.__baronBuildDrawingRequest!(type, 0, 'candle_pane', () => {
				drawEnds += 1;
				window.__baronDrawEnds = drawEnds;
			});
			request.id = id;
			const createdId = chart.createOverlay(request);
			const overlay = chart.getOverlays().find((item) => item.id === id);
			return {
				createdId,
				drawingMode: overlay?.drawingMode ?? null,
				totalStep: overlay?.totalStep ?? 0,
				currentStep: overlay?.currentStep ?? 0,
			};
		}, type);
		expect(meta.createdId).toBe(`mid-${type}`);
		expect(meta.drawingMode).not.toBeNull();
		const positions: ReadonlyArray<readonly [number, number]> = [
			[220, 260],
			[480, 340],
			[740, 300],
			[400, 430],
		];
		if (meta.drawingMode === 'continuous') {
			await page.mouse.move(220, 260);
			await page.mouse.down();
			await settle(page);
			await setKLineArea(page);
			await page.mouse.move(720, 430, { steps: 6 });
			await page.mouse.up();
		} else {
			// 内建模板 totalStep 语义不统一（priceChannelLine/parallelStraightLine
			// 报告 4 步但实际需要 5 次点击），因此以 onDrawEnd 触发为完成信号，
			// 最多点击 8 次；第一次点击固定拆成 down→area→up。
			let clicked = 0;
			while (clicked < 8) {
				const position = positions[Math.min(clicked, positions.length - 1)]!;
				await page.mouse.move(position[0], position[1]);
				if (clicked === 0) {
					await page.mouse.down();
					await settle(page);
					await setKLineArea(page);
					await page.mouse.up();
				} else {
					await page.mouse.click(position[0], position[1]);
				}
				clicked += 1;
				const done = await page.evaluate(() => (window.__baronDrawEnds ?? 0) >= 1);
				if (done) {
					break;
				}
			}
		}
		await settle(page);
		const after = await page.evaluate((id) => {
			const chart = window.__baronKChart as {
				getOverlays(): Array<{
					readonly id: string;
					readonly points: readonly unknown[];
					readonly currentStep?: number;
				}>;
				getStyles(): { readonly candle: { readonly type: string } };
				setStyles(value: Record<string, unknown>): void;
			};
			const overlay = chart.getOverlays().find((item) => item.id === id);
			const snapshot = {
				id: overlay?.id ?? null,
				points: structuredClone(overlay?.points ?? []),
				currentStep: overlay?.currentStep ?? 0,
				drawEnds: window.__baronDrawEnds ?? 0,
				typeAfterArea: chart.getStyles().candle.type,
				crosshair: window.__baronCrosshairCount ?? 0,
			};
			chart.setStyles({ candle: { type: 'candle_solid' } });
			const restored = chart.getOverlays().find((item) => item.id === id);
			return {
				snapshot,
				restoredId: restored?.id ?? null,
				restoredPoints: structuredClone(restored?.points ?? []),
				restoredType: chart.getStyles().candle.type,
			};
		}, meta.createdId as string);
		expect(after.snapshot.id).toBe(meta.createdId);
		expect(after.snapshot.typeAfterArea).toBe('area');
		expect(after.restoredType).toBe('candle_solid');
		expect(after.restoredId).toBe(meta.createdId);
		expect(after.restoredPoints).toEqual(after.snapshot.points);
		expect(after.snapshot.drawEnds).toBeGreaterThanOrEqual(1);
		await page.mouse.move(330, 390);
		await settle(page);
		const crosshairAfter = await page.evaluate(() => window.__baronCrosshairCount ?? 0);
		expect(crosshairAfter).toBeGreaterThan(after.snapshot.crosshair);
	});
}

for (const type of SUPPORTED_TYPES) {
	test(`@browser K线 ${type} primary 可创建且 additional 不可绑定`, async ({ page }) => {
		await page.addInitScript(OVERLAY_BUILDER_SOURCE);
		await page.goto('/test/fixture.html');
		await installKLineHarness(page);
		const result = await page.evaluate((type) => {
			const chart = window.__baronKChart as {
				createYAxis(value: Record<string, unknown>): unknown;
				getYAxes(value: { readonly paneId: string }): Array<{ readonly id: string }>;
				convertToPixel(
					point: Record<string, unknown>,
					filter: { readonly paneId: string; readonly yAxisId: string },
				): { readonly x?: number; readonly y?: number };
				createOverlay(value: Record<string, unknown>): unknown;
				getOverlays(): Array<{ readonly id: string }>;
			};
			const paneId = 'candle_pane';
			const additionalId = chart.createYAxis({
				id: 'y_additional',
				paneId,
				name: 'additional',
				position: 'left',
				needWidget: false,
			});
			const axes = chart.getYAxes({ paneId });
			const primaryId = axes[0]?.id;
			if (primaryId === undefined) {
				throw new Error('primary y axis missing');
			}
			const timestamp = 1784822400000;
			const value = 12.55;
			const primaryPixel = chart.convertToPixel(
				{ timestamp, value },
				{ paneId, yAxisId: primaryId },
			);
			const additionalPixel = chart.convertToPixel(
				{ timestamp, value },
				{ paneId, yAxisId: (additionalId as string) ?? 'y_additional' },
			);
			const overlay = window.__baronBuildOverlay!(type, 0, paneId, [12.34, 12.55, 12.74]);
			const createdPrimary = chart.createOverlay(overlay);
			const extraOverlay = {
				...overlay,
				id: `extra-${overlay.id}`,
				yAxisId: 'y_additional',
			};
			const extraCreated = chart.createOverlay(extraOverlay);
			const extraObject = chart.getOverlays().find(
				(item) => item.id === (extraCreated as string) || item.id === `extra-${overlay.id}`,
			);
			const normalOverlay = { ...overlay, id: `normal-${overlay.id}` };
			const normalCreated = chart.createOverlay(normalOverlay);
			const normalObject = chart.getOverlays().find(
				(item) => item.id === (normalCreated as string) || item.id === `normal-${overlay.id}`,
			);
			// 引擎会保留传入的额外字段，但 OverlayCreate 没有该契约；
			// 渲染固定使用 pane 默认轴（源码：getYAxisComponentById() 无参）。
			const retainedYAxisId = (extraObject as { yAxisId?: unknown } | undefined)?.yAxisId;
			const point = (overlay.points as ReadonlyArray<Record<string, unknown>>)[0]
				?? { timestamp, value };
			const firstPoint = (overlay.points as ReadonlyArray<Record<string, unknown>>)[0];
			const hasValuePoint = firstPoint !== undefined
				&& typeof firstPoint.value === 'number'
				&& Number.isFinite(firstPoint.value as number);
			const boundPixelDefault = chart.convertToPixel(
				(extraObject as { points?: ReadonlyArray<Record<string, unknown>> })?.points?.[0]
					?? point,
				{ paneId },
			);
			const normalPixelDefault = chart.convertToPixel(
				(normalObject as { points?: ReadonlyArray<Record<string, unknown>> })?.points?.[0]
					?? point,
				{ paneId },
			);
			return {
				createdPrimary: createdPrimary !== null && createdPrimary !== undefined,
				extraCreated: extraCreated !== null && extraCreated !== undefined,
				normalCreated: normalCreated !== null && normalCreated !== undefined,
				retainedYAxisId,
				primaryPixelY: primaryPixel.y ?? null,
				additionalPixelY: additionalPixel.y ?? null,
				boundPixelDefaultY: boundPixelDefault.y ?? null,
				normalPixelDefaultY: normalPixelDefault.y ?? null,
				hasValuePoint,
			};
		}, type);
		expect(result.createdPrimary).toBe(true);
		expect(result.extraCreated).toBe(true);
		expect(result.normalCreated).toBe(true);
		// 引擎接受但保留额外字段；该字段不参与轴绑定（默认投影一致）。
		expect(result.retainedYAxisId).toBe('y_additional');
		expect(result.primaryPixelY).not.toBeNull();
		if (result.hasValuePoint) {
			expect(result.boundPixelDefaultY).toBeCloseTo(result.normalPixelDefaultY!, 3);
		}
		// additional 轴在当前真实 fixture 下没有有效投影范围，无法作为 Drawing target。
		expect(
			result.additionalPixelY === null || !Number.isFinite(result.additionalPixelY),
		).toBe(true);
	});
}

test('@browser K线与 TimeSeries 两个容器 Chart 生命周期与 identity 独立', async ({ page }) => {
	await page.addInitScript(OVERLAY_BUILDER_SOURCE);
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createEngine } = await import('/src/engine.ts');
		const { registerProjectOverlays } = await import('/src/extensions/register.ts');
		const module = await import('/node_modules/.vite/deps/klinecharts.js');
		const { toKLineChartsTimeSeriesOptions } = await import('/src/conversion/chart-options.ts');
		const {
			TIME_SERIES_PANE_ID,
			toTimeSeriesIndicatorCreate,
			timeSeriesIndicatorTemplate,
		} = await import('/src/time-series/indicator.ts');
		const container = document.querySelector<HTMLElement>('#chart');
		if (container === null) {
			throw new Error('chart container missing');
		}
		const candidate = structuredClone(scene);
		candidate.runtime.runtimeVersion = '0.2.0';
		for (const pane of candidate.panes) {
			pane.yAxes = pane.yAxes.map((axis) => ({ ...axis, scale: 'linear' }));
		}
		const k = await createEngine(container, candidate);
		registerProjectOverlays(k.module.registerOverlay);
		const kChartBefore = k.chart;
		let kEvents = 0;
		k.chart.subscribeAction('onCrosshairChange', () => {
			kEvents += 1;
		});
		const kOverlayId = k.chart.createOverlay(
			window.__baronBuildOverlay!('horizontalStraightLine', 0, 'candle_pane', [12.34, 12.55, 12.74]),
		);
		k.chart.setStyles({
			candle: {
				type: 'area',
				area: {
					lineColor: 'rgba(41, 98, 255, 1)',
					lineSize: 2,
					value: 'close',
					backgroundColor: 'rgba(0, 0, 0, 0)',
					smooth: false,
					point: { show: false, animation: false },
				},
			},
		});
		k.chart.setStyles({ candle: { type: 'candle_solid' } });
		const kChartAfter = k.chart;
		const kOverlayAfter = k.chart.getOverlays().find((item) => item.id === kOverlayId);

		const tsContainer = document.createElement('div');
		tsContainer.style.width = '1000px';
		tsContainer.style.height = '600px';
		document.body.append(tsContainer);
		const tsChart = module.init(tsContainer, toKLineChartsTimeSeriesOptions({
			locale: 'zh-CN',
			timezone: 'Asia/Shanghai',
			layout: {
				backgroundColor: 'rgba(255, 255, 255, 1)',
				textColor: 'rgba(34, 34, 34, 1)',
				fontFamily: 'Baron Sans',
				fontSize: 12,
			},
			grid: {
				horizontalColor: 'rgba(225, 226, 230, 1)',
				verticalColor: 'rgba(225, 226, 230, 1)',
			},
			thousandsSeparator: ',',
			decimalFold: { enabled: false, threshold: 8 },
			zoomAnchor: 'cursor',
			dateFormat: 'yyyy-MM-dd',
			fontFamily: 'Baron Sans',
			fontSize: 12,
		} as never));
		if (tsChart === null) {
			throw new Error('ts chart is null');
		}
		const tsRoot = tsContainer.firstElementChild;
		if (tsRoot instanceof HTMLElement) {
			tsRoot.style.touchAction = 'none';
		}
		tsChart.setSymbol({
			ticker: '@baron1996/time-series-scene',
			pricePrecision: 2,
			volumePrecision: 0,
		});
		tsChart.setPeriod({ type: 'day', span: 1 });
		tsChart.setDataLoader({
			getBars({ type, callback }): void {
				callback(
					type === 'init'
						? [
							{
								timestamp: 1784736000000,
								open: 0,
								high: 0,
								low: 0,
								close: 0,
								volume: 0,
								__baronTimeSeriesValues: { 'series-a': 12.34 },
							},
							{
								timestamp: 1784822400000,
								open: 0,
								high: 0,
								low: 0,
								close: 0,
								volume: 0,
								__baronTimeSeriesValues: { 'series-a': 12.55 },
							},
							{
								timestamp: 1784908800000,
								open: 0,
								high: 0,
								low: 0,
								close: 0,
								volume: 0,
								__baronTimeSeriesValues: { 'series-a': 12.74 },
							},
						]
						: [],
					{ forward: false, backward: false },
				);
			},
		});
		registerProjectOverlays(module.registerOverlay);
		module.registerIndicator(timeSeriesIndicatorTemplate);
		tsChart.createIndicator(
			toTimeSeriesIndicatorCreate({
				id: 'series-a',
				name: 'Series A',
				type: 'line',
				unit: 'unit',
				precision: 2,
				visible: true,
				style: { color: 'rgba(96, 165, 250, 1)', size: 2, style: 'solid' },
			} as never),
			true,
		);
		tsChart.setPaneOptions({
			id: 'candle_pane',
			height: 0,
			minHeight: 0,
			order: 0,
			state: 'minimize',
			dragEnabled: false,
		});
		tsChart.setPaneOptions({
			id: TIME_SERIES_PANE_ID,
			height: 480,
			minHeight: 120,
			order: 1,
			state: 'normal',
			dragEnabled: false,
		});
		const tsChartRef = tsChart;

		k.module.dispose(container);
		container.replaceChildren();
		const kContainerCleaned = container.childElementCount === 0;
		const tsOverlayId = tsChart.createOverlay(
			window.__baronBuildOverlay!(
				'horizontalStraightLine',
				0,
				TIME_SERIES_PANE_ID,
				[12.34, 12.55, 12.74],
			),
		);
		const k2 = await createEngine(container, candidate);
		registerProjectOverlays(k2.module.registerOverlay);
		return {
			kSameIdentity: kChartBefore === kChartAfter,
			kOverlaySame: kOverlayAfter?.id === kOverlayId,
			kOverlayPoints: kOverlayAfter?.points?.length ?? 0,
			kEventsKept: kEvents,
			kContainerCleaned,
			tsUsable: tsOverlayId !== null && tsOverlayId !== undefined,
			tsSameIdentity: tsChartRef === tsChart,
			kReinitOk: k2.chart !== null,
		};
	}, klineScene);
	expect(result.kSameIdentity).toBe(true);
	expect(result.kOverlaySame).toBe(true);
	expect(result.kOverlayPoints).toBeGreaterThanOrEqual(1);
	expect(result.kContainerCleaned).toBe(true);
	expect(result.tsUsable).toBe(true);
	expect(result.tsSameIdentity).toBe(true);
	expect(result.kReinitOk).toBe(true);
});

test('@browser TimeSeries 零值与负值线性轴 Drawing 全部可创建', async ({ page }) => {
	await page.addInitScript(OVERLAY_BUILDER_SOURCE);
	await page.goto('/test/fixture.html');
	await installTimeSeriesHarness(page, ZERO_NEGATIVE_VALUES);
	const result = await page.evaluate((types) => {
		const chart = window.__baronTSChart as {
			createOverlay(value: unknown): unknown;
			getOverlays(): Array<{ readonly id: string }>;
			overrideOverlay(value: Record<string, unknown>): boolean;
			removeOverlay(value: { readonly id: string }): boolean;
		};
		return window.__baronRunCreateUpdateRemove!(
			chart,
			types,
			window.__baronTSPaneId!,
			[0, -3.2, 12.74],
		);
	}, SUPPORTED_TYPES);
	expect(result).toHaveLength(22);
	expect(result.every((entry) => entry.created)).toBe(true);
	expect(result.every((entry) => entry.updated)).toBe(true);
	expect(result.every((entry) => entry.removed)).toBe(true);
});

test('@browser TimeSeries priceMeasurement 零起点只显示绝对变化且百分比为 —', async ({ page }) => {
	await page.addInitScript(OVERLAY_BUILDER_SOURCE);
	await page.goto('/test/fixture.html');
	await installTimeSeriesHarness(page, [0, 12.55, 12.74]);
	const result = await page.evaluate(async () => {
		const { derivePriceMeasurementDisplay } = await import('/src/extensions/price-measurement.ts');
		let derived: Record<string, unknown> | { readonly threw: string } | null = null;
		try {
			derived = derivePriceMeasurementDisplay(0, 12.55, 2) as Record<string, unknown>;
		} catch (error) {
			derived = { threw: String(error) };
		}
		const chart = window.__baronTSChart as {
			createOverlay(value: Record<string, unknown>): unknown;
			getOverlays(): Array<{
				readonly id: string;
				readonly points: readonly unknown[];
			}>;
		};
		const paneId = window.__baronTSPaneId!;
		const overlay = window.__baronBuildOverlay!('priceMeasurement', 0, paneId, [0, 12.55, 12.74]);
		let created = false;
		try {
			created = chart.createOverlay(overlay as never) !== null;
		} catch (error) {
			derived = { threw: `createOverlay: ${String(error)}` };
		}
		const snapshot = chart.getOverlays().find((item) => item.id === overlay.id);
		return {
			derived,
			created,
			points: snapshot?.points?.length ?? 0,
		};
	});
	expect(result.derived).not.toBeNull();
	if ('threw' in (result.derived as Record<string, unknown>)) {
		throw new Error(`derivePriceMeasurementDisplay threw: ${String((result.derived as Record<string, unknown>).threw)}`);
	}
	const derived = result.derived as { readonly label: string; readonly percentageChange: unknown };
	expect(derived.label).toContain('(—%)');
	expect(derived.percentageChange).toBeNull();
	expect(result.created).toBe(true);
	expect(result.points).toBe(2);
});
