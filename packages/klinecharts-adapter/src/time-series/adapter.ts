import type {
	Drawing,
	DrawableWorkspaceDocument,
	TimeSeriesPoint,
	TimeSeriesScene,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import {
	parseDrawableWorkspaceDocument,
	parseTimeSeriesScene,
	TimeSeriesSceneError,
	SceneError,
} from '@baron1996/kline-scene-schema';
import type {
	ActionCallback,
	Chart,
	KLineData,
	Overlay,
} from 'klinecharts';

import { toKLineChartsTimeSeriesOptions } from '../conversion/chart-options.js';
import { registerProjectOverlays } from '../extensions/register.js';
import { applyViewport } from '../conversion/viewport.js';
import {
	fromEngineOverlay,
	toEngineOverlay,
	toEngineOverlayDrawing,
	toOverlayStyles,
	type OverlayDrawingSource,
	type EngineOverlayCallbacks,
} from '../conversion/overlays.js';
import { createDragCandidate, type DragDataPoint } from '../interaction/dragging.js';
import {
	hitTestOverlayGeometries,
	type OverlayHitResult,
	type OverlayPixelGeometry,
	type PixelCoordinate,
} from '../interaction/hit-testing.js';
import { shouldIgnoreStaleOverlayDeselection } from '../interaction/selection-arbitration.js';
import { normalizePriceValue } from '../conversion/price.js';
import {
	drawingToSceneOverlay,
	sceneOverlayToDrawing,
} from '../drawing/overlay-conversion.js';
import type {
	DrawingEnginePort,
	EngineDrawingEvent,
	EngineDrawingSnapshot,
	EngineDrawingStartRequest,
	EnginePixelCoordinate,
	EnginePointProjection,
} from '../drawing/engine-port.js';
import type { InteractionDimensions } from '../drawing/interaction-normalization.js';
import {
	TIME_SERIES_INDICATOR_NAME,
	TIME_SERIES_PANE_ID,
	TIME_SERIES_Y_AXIS_ID,
	timeSeriesIndicatorTemplate,
	toTimeSeriesIndicatorCreate,
} from './indicator.js';

export interface TimeSeriesAdapterCrosshair {
	readonly timestamp: number | null;
	readonly values: Readonly<Record<string, number | null>> | null;
}

export type TimeSeriesAdapterCrosshairListener = (
	event: TimeSeriesAdapterCrosshair,
) => void;

interface TimeSeriesEngineIdMap {
	readonly paneToEngine: ReadonlyMap<string, string>;
	readonly paneFromEngine: ReadonlyMap<string, string>;
	readonly yAxisToEngine: ReadonlyMap<string, string>;
	readonly yAxisFromEngine: ReadonlyMap<string, string>;
}

interface KLineChartsModule {
	readonly dispose: (container: HTMLElement) => void;
	readonly init: typeof import('klinecharts').init;
	readonly registerIndicator: typeof import('klinecharts').registerIndicator;
	readonly version: typeof import('klinecharts').version;
}

interface TimeSeriesCarrierData extends KLineData {
	readonly __baronTimeSeriesValues: Readonly<Record<string, number | null>>;
}

interface PointerInteraction {
	readonly pointerId: number;
	readonly originClient: PixelCoordinate;
	readonly originData: DragDataPoint;
	readonly hit: OverlayHitResult;
	readonly before: SceneOverlay;
	readonly interactionId: string;
	started: boolean;
	candidate?: SceneOverlay;
}

interface InteractivePriceMeasurement {
	readonly type: 'priceMeasurement';
	readonly source: OverlayDrawingSource & { readonly type: 'priceMeasurement' };
	start?: NonNullable<SceneOverlay['start']>;
}

function carrierData(data: readonly TimeSeriesPoint[]): TimeSeriesCarrierData[] {
	return data.map(({ timestamp, values }) => ({
		timestamp,
		open: 0,
		high: 0,
		low: 0,
		close: 0,
		volume: 0,
		__baronTimeSeriesValues: normalizeValues(values),
	}));
}

function normalizeValues(
	values: TimeSeriesPoint['values'],
): Readonly<Record<string, number | null>> {
	const normalized: Record<string, number | null> = {};
	for (const [seriesId, value] of Object.entries(values)) {
		if (value === undefined) {
			throw adapterError(`Time Series value ${seriesId} is undefined.`);
		}
		normalized[seriesId] = value;
	}
	return normalized;
}

function dataLoader(data: readonly TimeSeriesPoint[]) {
	const snapshot = carrierData(data) as KLineData[];
	return {
		getBars({ type, callback }: Parameters<
			import('klinecharts').DataLoader['getBars']
		>[0]): void {
			callback(type === 'init' ? structuredClone(snapshot) : [], {
				forward: false,
				backward: false,
			});
		},
	};
}

function hasVisibleFiniteValue(scene: TimeSeriesScene): boolean {
	const visible = new Set(
		scene.series.filter((series) => series.visible).map((series) => series.id),
	);
	return scene.data.some((point) =>
		Object.entries(point.values).some(
			([id, value]) => visible.has(id) && value !== null,
		),
	);
}

function adapterError(message: string): TimeSeriesSceneError {
	return new TimeSeriesSceneError(
		'TIME_SERIES_ADAPTER_FAILED',
		'/runtime/adapter',
		message,
	);
}

function dataError(error: TimeSeriesSceneError): TimeSeriesSceneError {
	const issues = error.issues.map((issue) => ({
		...issue,
		code: 'TIME_SERIES_DATA_INVALID' as const,
		path: issue.path.startsWith('/data') ? issue.path : '/data',
	}));
	return new TimeSeriesSceneError(
		'TIME_SERIES_DATA_INVALID',
		'/data',
		'Time Series replacement data is invalid.',
		issues,
	);
}

function createTimeSeriesOverlayIdMap(): TimeSeriesEngineIdMap {
	const paneToEngine = new Map<string, string>([
		[TIME_SERIES_PANE_ID, TIME_SERIES_PANE_ID],
	]);
	const yAxisToEngine = new Map<string, string>([
		[TIME_SERIES_Y_AXIS_ID, TIME_SERIES_Y_AXIS_ID],
	]);
	return {
		paneToEngine,
		paneFromEngine: new Map(Array.from(paneToEngine, ([sceneId, engineId]) => [engineId, sceneId])),
		yAxisToEngine,
		yAxisFromEngine: new Map(Array.from(yAxisToEngine, ([sceneId, engineId]) => [engineId, sceneId])),
	};
}

function requireMappedId(map: ReadonlyMap<string, string>, sceneId: string, path: string): string {
	const mapped = map.get(sceneId);
	if (mapped === undefined) {
		throw adapterError(`${path} ${sceneId} is not mapped.`);
	}
	return mapped;
}

/** TimeSeriesScene 与 KLineCharts 之间的唯一受控边界。 */
export class TimeSeriesChartsAdapter implements DrawingEnginePort {
	/** KLineCharts 实例，只能在 Adapter 内使用。 */
	readonly #chart: Chart;
	/** 引擎模块，用于版本检查和精确销毁。 */
	readonly #engine: KLineChartsModule;
	/** 当前可导出的规范化 Scene。 */
	#scene: TimeSeriesScene;
	/** TimeSeries 场景上图表层绘制的 overlay id 映射。 */
	readonly #overlayIdMap: TimeSeriesEngineIdMap;
	/** 运行时可见的 overlay 草稿状态，受该 Adapter 控制。 */
	#drawings: SceneOverlay[];
	/** 当前运行时选中的 overlay id。 */
	#selectedOverlayId: string | null = null;
	/** 当前交互中的 priceMeasurement overlay 来源。 */
	#interactiveDrawing: InteractivePriceMeasurement | null = null;
	/** 当前场景主价精度，用于 overlay 坐标规范化。 */
	#pricePrecision: number;
	/** 按时间戳索引的原始点，保证十字线查询为 O(1)。 */
	#pointByTimestamp: Map<number, TimeSeriesPoint>;
	/** Adapter 独占的图表容器。 */
	readonly #container: HTMLElement;
	/** KLineCharts 交互根节点，用于补全离开绘图区事件。 */
	readonly #interactiveRoot: HTMLElement;
	/** 创建前容器背景，销毁后恢复。 */
	readonly #originalBackground: string;
	/** 十字线纯数据监听器。 */
	readonly #crosshairListeners = new Set<TimeSeriesAdapterCrosshairListener>();
	/** 当前受控拖拽会话。 */
	#pointerInteraction: PointerInteraction | undefined;
	/** 内部确定性交互序号。 */
	#interactionSequence = 0;
	/** 防止重复销毁底层引擎。 */
	#disposed = false;
	/** 显式 Workspace 模式。 */
	#workspaceMode = false;
	/** Workspace 模式权威业务 Drawing。 */
	#workspaceSources = new Map<string, Drawing>();
	/** 公共 Drawing 端口监听器。 */
	readonly #portListeners = new Set<(event: EngineDrawingEvent) => void>();
	/** 交互启用开关。 */
	#mutationsEnabled = true;
	/** 当前拖动会话编辑维度。 */
	#interactionDimensions: InteractionDimensions = {
		horizontal: false,
		vertical: false,
	};

	private constructor(
		container: HTMLElement,
		scene: TimeSeriesScene,
		chart: Chart,
		engine: KLineChartsModule,
		originalBackground: string,
		interactiveRoot: HTMLElement,
	) {
		this.#container = container;
		this.#scene = scene;
		this.#overlayIdMap = createTimeSeriesOverlayIdMap();
		this.#drawings = [];
		this.#pricePrecision = scene.series[0]?.precision ?? 0;
		this.#pointByTimestamp = new Map(
			scene.data.map((point) => [point.timestamp, point]),
		);
		this.#chart = chart;
		this.#engine = engine;
		this.#originalBackground = originalBackground;
		this.#interactiveRoot = interactiveRoot;
		this.#chart.subscribeAction('onCrosshairChange', this.#handleCrosshair);
		this.#installInteractionListeners();
		this.#interactiveRoot.addEventListener(
			'pointerleave',
			this.#handlePointerLeave,
		);
	}

	public static async create(
		container: HTMLElement,
		value: unknown,
	): Promise<TimeSeriesChartsAdapter> {
		const scene = parseTimeSeriesScene(value);
		const originalBackground = container.style.backgroundColor;
		const engine = await import('klinecharts');
		let chart: Chart | null = null;
		try {
			if (engine.version() !== scene.runtime.engineVersion) {
				throw adapterError('KLineCharts engine version does not match the Scene.');
			}
			chart = engine.init(container, toKLineChartsTimeSeriesOptions(scene.chart));
			if (chart === null) {
				throw adapterError('KLineCharts returned null while initializing.');
			}
			const root = container.firstElementChild;
			if (!(root instanceof HTMLElement)) {
				throw adapterError('KLineCharts did not create an interactive root.');
			}
			root.style.touchAction = 'none';
			chart.setSymbol({
				ticker: '@baron1996/time-series-scene',
				pricePrecision: scene.series[0].precision,
				volumePrecision: 0,
			});
			registerProjectOverlays(engine.registerOverlay);
			chart.setPeriod(structuredClone(scene.period));
			chart.setDataLoader(dataLoader(scene.data));
			engine.registerIndicator(timeSeriesIndicatorTemplate);
			for (const series of scene.series) {
				const expectedId = `baron_time_series_${series.id}`;
				const createdId = chart.createIndicator(
					toTimeSeriesIndicatorCreate(series),
					true,
				);
				if (createdId !== expectedId) {
					throw adapterError(`KLineCharts failed to create series ${series.id}.`);
				}
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
			const adapter = new TimeSeriesChartsAdapter(
				container,
				scene,
				chart,
				engine,
				originalBackground,
				root,
			);
			adapter.#updateAxisVisibility();
			applyViewport(chart, scene.viewport);
			container.style.backgroundColor = scene.chart.layout.backgroundColor;
			return adapter;
		} catch (error) {
			if (chart !== null) {
				engine.dispose(container);
			}
			container.replaceChildren();
			container.style.backgroundColor = originalBackground;
			if (error instanceof TimeSeriesSceneError) {
				throw error;
			}
			throw adapterError('KLineCharts failed to initialize TimeSeriesScene.');
		}
	}

	/** 显式 Workspace factory：时间序列场景 + DrawingDocument。 */
	public static async createWorkspace(
		container: HTMLElement,
		value: unknown,
	): Promise<TimeSeriesChartsAdapter> {
		const workspace = parseDrawableWorkspaceDocument(value);
		if (workspace.scene.kind !== 'time-series') {
			throw new TimeSeriesSceneError(
				'TIME_SERIES_SCENE_SCHEMA_INVALID',
				'/scene/kind',
				'TimeSeriesChartsAdapter requires a time-series Workspace Scene.',
			);
		}
		const scene = workspace.scene.document;
		const originalBackground = container.style.backgroundColor;
		const engine = await import('klinecharts');
		let chart: Chart | null = null;
		try {
			if (engine.version() !== scene.runtime.engineVersion) {
				throw adapterError('KLineCharts engine version does not match the Scene.');
			}
			chart = engine.init(container, toKLineChartsTimeSeriesOptions(scene.chart));
			if (chart === null) {
				throw adapterError('KLineCharts returned null while initializing.');
			}
			const root = container.firstElementChild;
			if (!(root instanceof HTMLElement)) {
				throw adapterError('KLineCharts did not create an interactive root.');
			}
			root.style.touchAction = 'none';
			chart.setSymbol({
				ticker: '@baron1996/time-series-scene',
				pricePrecision: scene.series[0].precision,
				volumePrecision: 0,
			});
			registerProjectOverlays(engine.registerOverlay);
			chart.setPeriod(structuredClone(scene.period));
			chart.setDataLoader(dataLoader(scene.data));
			engine.registerIndicator(timeSeriesIndicatorTemplate);
			for (const series of scene.series) {
				const expectedId = `baron_time_series_${series.id}`;
				const createdId = chart.createIndicator(
					toTimeSeriesIndicatorCreate(series),
					true,
				);
				if (createdId !== expectedId) {
					throw adapterError(`KLineCharts failed to create series ${series.id}.`);
				}
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
			const adapter = new TimeSeriesChartsAdapter(
				container,
				scene,
				chart,
				engine,
				originalBackground,
				root,
			);
			adapter.#workspaceMode = true;
			adapter.#updateAxisVisibility();
			applyViewport(chart, scene.viewport);
			container.style.backgroundColor = scene.chart.layout.backgroundColor;
			adapter.#restoreWorkspaceDrawings(
				workspace.drawings.drawings.map((drawing) =>
					timeSeriesSnapshotOfDrawing(drawing),
				),
			);
			return adapter;
		} catch (error) {
			if (chart !== null) {
				engine.dispose(container);
			}
			container.replaceChildren();
			container.style.backgroundColor = originalBackground;
			if (error instanceof TimeSeriesSceneError) {
				throw error;
			}
			throw adapterError('KLineCharts failed to initialize the Workspace Scene.');
		}
	}

	#assertActive(): void {
		if (this.#disposed) {
			throw adapterError('The Time Series Adapter has already been disposed.');
		}
	}

	#emitPort(event: EngineDrawingEvent): void {
		for (const listener of this.#portListeners) {
			listener(structuredClone(event));
		}
	}

	#restoreWorkspaceDrawings(
		drawings: readonly EngineDrawingSnapshot[],
	): void {
		for (const overlay of this.#drawings) {
			this.#chart.removeOverlay({ id: overlay.id });
		}
		this.#drawings = [];
		this.#workspaceSources = new Map();
		for (const snapshot of drawings) {
			const drawing = timeSeriesDrawingFromSnapshot(snapshot);
			this.#workspaceSources.set(drawing.id, drawing);
			const overlay = drawingToSceneOverlay(drawing, TIME_SERIES_PANE_ID);
			const result = this.#chart.createOverlay(
				toEngineOverlay(
					overlay,
					this.#overlayIdMap,
					`/drawings/${this.#drawings.length}`,
					this.#overlayCallbacks(overlay),
				),
			);
			if (result !== overlay.id) {
				throw adapterError(`KLineCharts failed to restore Drawing ${overlay.id}.`);
			}
			this.#drawings.push(structuredClone(overlay));
		}
	}

	#fromPixelToData(
		point: EnginePixelCoordinate,
	): EnginePointProjection {
		const converted = this.#chart.convertFromPixel(
			[point],
			{
				paneId: TIME_SERIES_PANE_ID,
				yAxisId: TIME_SERIES_Y_AXIS_ID,
				absolute: true,
			},
		) as Array<Partial<import('klinecharts').Point>>;
		const value = converted[0];
		return {
			...(value?.timestamp !== undefined ? { timestamp: value.timestamp } : {}),
			...(value?.value !== undefined ? { value: value.value } : {}),
		};
	}

	#updateAxisVisibility(): void {
		const hasValues = hasVisibleFiniteValue(this.#scene);
		this.#chart.overrideYAxis({
			id: TIME_SERIES_Y_AXIS_ID,
			paneId: TIME_SERIES_PANE_ID,
			name: 'normal',
			position: 'right',
			inside: false,
			scrollZoomEnabled: false,
			gap: { top: 0.12, bottom: 0.08 },
			needWidget: hasValues,
			createTicks: ({ defaultTicks }) => hasValues ? defaultTicks : [],
		});
	}

	readonly #handleCrosshair: ActionCallback = (value): void => {
		if (this.#disposed) {
			return;
		}
		let timestamp: number | null = null;
		if (value !== null && typeof value === 'object') {
			if ('timestamp' in value && typeof value.timestamp === 'number') {
				timestamp = value.timestamp;
			} else if ('x' in value && typeof value.x === 'number') {
				const converted = this.#chart.convertFromPixel(
					[{ x: value.x, y: 0 }],
					{
						paneId: TIME_SERIES_PANE_ID,
						yAxisId: TIME_SERIES_Y_AXIS_ID,
					},
				);
				const point = Array.isArray(converted) ? converted[0] : converted;
				timestamp = typeof point?.timestamp === 'number'
					? point.timestamp
					: null;
			}
		}
		const point = timestamp === null
			? undefined
			: this.#pointByTimestamp.get(timestamp);
		const event: TimeSeriesAdapterCrosshair = point === undefined
			? { timestamp: null, values: null }
			: { timestamp: point.timestamp, values: normalizeValues(point.values) };
		for (const listener of this.#crosshairListeners) {
			listener(structuredClone(event));
		}
	};

	readonly #handlePointerLeave = (): void => {
		if (this.#disposed) {
			return;
		}
		for (const listener of this.#crosshairListeners) {
			listener({ timestamp: null, values: null });
		}
	};

	#engineOverlays(): Overlay[] {
		return this.#chart.getOverlays();
	}

	#selectOverlay(id: string | null): void {
		if (this.#workspaceMode && this.#selectedOverlayId !== id) {
			this.#emitPort({
				type: id === null ? 'deselected' : 'selected',
				id: id ?? this.#selectedOverlayId ?? '',
			});
		}
		this.#selectedOverlayId = id;
	}

	#timeSeriesDimensionsForHit(
		overlay: SceneOverlay,
		hit: { readonly target: 'anchor' | 'body' },
	): InteractionDimensions {
		if (hit.target !== 'anchor') {
			return { horizontal: true, vertical: true };
		}
		switch (overlay.type) {
			case 'horizontalStraightLine':
			case 'priceLine':
			case 'simpleTag':
			case 'horizontalRayLine':
			case 'horizontalSegment':
				return { horizontal: false, vertical: true };
			case 'verticalStraightLine':
			case 'verticalRayLine':
			case 'verticalSegment':
				return { horizontal: true, vertical: false };
			default:
				return { horizontal: true, vertical: true };
		}
	}

	#commitEngineOverlay(
		engineOverlay: Overlay,
		source: OverlayDrawingSource | SceneOverlay,
		kind: 'created' | 'updated',
	): void {
		const existingIndex = this.#drawings.findIndex((overlay) => overlay.id === source.id);
		const currentSource = existingIndex < 0 ? source : this.#drawings[existingIndex]!;
		const overlay = fromEngineOverlay(
			engineOverlay,
			currentSource,
			this.#overlayIdMap,
			existingIndex < 0 ? `/drawings/${this.#drawings.length}` : `/drawings/${existingIndex}`,
			this.#pricePrecision,
		);
		const drawings = structuredClone(this.#drawings);
		if (existingIndex < 0) {
			drawings.push(overlay);
		} else {
			drawings[existingIndex] = overlay;
		}
		this.#drawings = structuredClone(drawings);
		this.#selectOverlay(overlay.id);
		if (this.#workspaceMode) {
			const drawing = this.#workspaceSources.get(overlay.id);
			if (drawing !== undefined) {
				const updated = sceneOverlayToDrawing(overlay, drawing);
				this.#workspaceSources.set(overlay.id, updated);
				this.#emitPort({
					type: kind === 'created' ? 'created' : 'updated',
					id: overlay.id,
					drawing: timeSeriesSnapshotOfDrawing(updated),
					editDimensions: structuredClone(this.#interactionDimensions),
				});
			}
		}
	}

	#safelyCommitEngineOverlay(
		engineOverlay: Overlay,
		source: OverlayDrawingSource | SceneOverlay,
		kind: 'created' | 'updated',
	): void {
		try {
			this.#commitEngineOverlay(engineOverlay, source, kind);
		} catch (error) {
			if (error instanceof SceneError) {
				throw error;
			}
			throw adapterError(
				`KLineCharts failed to ${kind} time-series drawing ${source.id}.`,
			);
		}
	}

	#overlayCallbacks(
		source: OverlayDrawingSource | SceneOverlay,
		drawing = false,
	): EngineOverlayCallbacks {
		return {
			onRightClick: ({ preventDefault }) => {
				preventDefault?.();
			},
			onDrawEnd: ({ overlay }) => {
				if (
					drawing &&
					this.#interactiveDrawing?.source.id === source.id
				) {
					this.#interactiveDrawing = null;
				}
				this.#safelyCommitEngineOverlay(overlay, source, drawing ? 'created' : 'updated');
			},
			onPressedMoveStart: ({ overlay }) => {
				this.#selectOverlay(overlay.id);
			},
			onPressedMoveEnd: ({ overlay }) => {
				if (!isControlledInteractionOverlay(source as SceneOverlay)) {
					this.#safelyCommitEngineOverlay(overlay, source, 'updated');
				}
			},
			onSelected: ({ overlay }) => {
				this.#selectOverlay(overlay.id);
			},
			onDeselected: (event) => {
				const eventX = event.x;
				const eventY = event.y;
				const coordinate =
					typeof eventX === 'number' && Number.isFinite(eventX) &&
					typeof eventY === 'number' && Number.isFinite(eventY)
					? { x: eventX, y: eventY }
					: undefined;
				if (
					this.#selectedOverlayId === event.overlay.id &&
					!shouldIgnoreStaleOverlayDeselection(
						this.#selectedOverlayId,
						event.overlay.id,
						coordinate,
						this.#overlayGeometries(),
					)
				) {
					this.#selectOverlay(null);
				}
			},
			onRemoved: ({ overlay }) => {
				if (this.#interactiveDrawing?.source.id === overlay.id) {
					this.#interactiveDrawing = null;
				}
				const index = this.#drawings.findIndex((candidate) => candidate.id === overlay.id);
				if (index >= 0) {
					this.#drawings = this.#drawings.filter((candidate) => candidate.id !== overlay.id);
					if (this.#selectedOverlayId === overlay.id) {
						this.#selectOverlay(null);
					}
					if (this.#workspaceMode) {
						this.#workspaceSources.delete(overlay.id);
						this.#emitPort({ type: 'removed', id: overlay.id });
					}
				}
			},
		};
	}

	#completeInteractivePriceMeasurement(
		drawing: InteractivePriceMeasurement,
		end: NonNullable<SceneOverlay['end']>,
	): void {
		const source = drawing.source;
		if (drawing.start === undefined) {
			throw adapterError('Incomplete interactive price measurement anchors.');
		}
		const overlay = fromEngineOverlay(
			{
				...structuredClone(source),
				id: source.id,
				name: source.type,
				paneId: requireMappedId(
					this.#overlayIdMap.paneToEngine,
					source.paneId,
					'/overlays/paneId',
				),
				lock: source.locked,
				visible: source.visible,
				zLevel: source.zLevel,
				mode: source.mode,
				points: [
					{
						value: drawing.start.value,
						timestamp: drawing.start.timestamp,
					},
					{
						value: end.value,
						timestamp: end.timestamp,
					},
				],
				styles: toOverlayStyles(source.styles),
			} as unknown as import('klinecharts').Overlay,
			source,
			this.#overlayIdMap,
			`/drawings/${this.#drawings.length}`,
			this.#pricePrecision,
		);
		const result = overlay;
		if (!this.#chart.removeOverlay({ id: result.id })) {
			throw adapterError(`KLineCharts failed to replace in-progress Drawing ${result.id}.`);
		}
		const created = this.#chart.createOverlay(
			toEngineOverlay(
				result,
				this.#overlayIdMap,
				`/drawings/${this.#drawings.length}`,
				this.#overlayCallbacks(result),
			),
		);
		if (created !== result.id) {
			throw adapterError(`KLineCharts failed to persist Drawing ${result.id}.`);
		}
		this.#drawings = [...this.#drawings, result];
		this.#selectOverlay(result.id);
	}

	#toPixel(point: Partial<{
		timestamp: number;
		value: number;
	}>, paneId: string): PixelCoordinate {
		const converted = this.#chart.convertToPixel(point, {
			paneId,
			yAxisId: TIME_SERIES_Y_AXIS_ID,
			absolute: true,
		}) as Partial<import('klinecharts').Coordinate>;
		if (!Number.isFinite(converted.x) || !Number.isFinite(converted.y)) {
			throw new SceneError(
				'EXPORT_INVALID',
				'/overlays',
				'KLineCharts returned a non-finite pixel coordinate.',
			);
		}
		return { x: converted.x!, y: converted.y! };
	}

	#fromPixel(point: PixelCoordinate, paneId: string): DragDataPoint {
		const converted = this.#chart.convertFromPixel(
			[point],
			{
				paneId,
				yAxisId: TIME_SERIES_Y_AXIS_ID,
				absolute: true,
			},
		) as Array<Partial<import('klinecharts').Point>>;
		const value = converted[0];
		if (!Number.isFinite(value?.dataIndex) || !Number.isFinite(value?.value)) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/overlays',
				'Pointer does not map to finite chart data.',
			);
		}
		return { dataIndex: value!.dataIndex!, value: value!.value! };
	}

	#measurementAnchor(
		point: PixelCoordinate,
		paneId: string,
		path: string,
	): NonNullable<SceneOverlay['start']> {
		const converted = this.#chart.convertFromPixel(
			[point],
			{
				paneId,
				yAxisId: TIME_SERIES_Y_AXIS_ID,
				absolute: true,
			},
		) as Array<Partial<import('klinecharts').Point>>;
		const value = converted[0];
		if (
			value === undefined ||
			!Number.isSafeInteger(value.timestamp) ||
			!this.#scene.data.some((bar) => bar.timestamp === value.timestamp)
		) {
			throw new SceneError(
				'INVALID_REFERENCE',
				path,
				'Pointer does not map to a finite price and an embedded market-data timestamp.',
			);
		}
		return {
			timestamp: value.timestamp!,
			value: normalizePriceValue(
				value.value!,
				this.#pricePrecision,
				`${path}/value`,
			),
		};
	}

	#overlayGeometries(): readonly OverlayPixelGeometry[] {
		const geometries: OverlayPixelGeometry[] = [];
		for (let index = 0; index < this.#drawings.length; index++) {
			const overlay = this.#drawings[index];
			if (overlay === undefined || !overlay.visible) {
				continue;
			}
			if (overlay.type === 'horizontalStraightLine') {
				const anchor = overlay.anchor;
				if (anchor === undefined || !('value' in anchor)) {
					continue;
				}
				const anchorPixel = this.#toPixel(
					{ timestamp: this.#scene.data[0]!.timestamp, value: anchor.value },
					overlay.paneId,
				);
				const paneMain = this.#chart.getDom(TIME_SERIES_PANE_ID, 'main');
				const containerRect = this.#container.getBoundingClientRect();
				const mainRect = paneMain?.getBoundingClientRect() ?? containerRect;
				const start = { x: mainRect.left - containerRect.left, y: anchorPixel.y };
				const end = { x: mainRect.right - containerRect.left, y: anchorPixel.y };
				geometries.push({
					overlayId: overlay.id,
					sceneIndex: index,
					zLevel: overlay.zLevel,
					locked: overlay.locked,
					anchors: [{ x: (start.x + end.x) / 2, y: anchorPixel.y }],
					bodySegments: [[start, end]],
				});
				continue;
			}
			if (overlay.type === 'priceMeasurement' && overlay.start !== undefined && overlay.end !== undefined) {
				const start = this.#toPixel(overlay.start, overlay.paneId);
				const end = this.#toPixel(overlay.end, overlay.paneId);
				geometries.push({
					overlayId: overlay.id,
					sceneIndex: index,
					zLevel: overlay.zLevel,
					locked: overlay.locked,
					anchors: [start, end],
					bodySegments: [[start, end]],
				});
				continue;
			}
			if (overlay.points !== undefined && overlay.points.length >= 2) {
				const anchors = overlay.points.map((point) => this.#toPixel(point, overlay.paneId));
				const bodySegments: Array<readonly [PixelCoordinate, PixelCoordinate]> = [];
				for (let pointIndex = 1; pointIndex < anchors.length; pointIndex++) {
					bodySegments.push([anchors[pointIndex - 1]!, anchors[pointIndex]!]);
				}
				geometries.push({
					overlayId: overlay.id,
					sceneIndex: index,
					zLevel: overlay.zLevel,
					locked: overlay.locked,
					anchors,
					bodySegments,
				});
			}
		}
		return geometries;
	}

	readonly #handlePointerDown = (event: PointerEvent): void => {
		if (
			this.#disposed ||
			event.button !== 0 ||
			this.#pointerInteraction !== undefined ||
			!this.#mutationsEnabled
		) {
			return;
		}
		const coordinate = (() => {
			const rect = this.#container.getBoundingClientRect();
			return { x: event.clientX - rect.left, y: event.clientY - rect.top };
		})();
		const drawing = this.#interactiveDrawing;
		if (drawing !== null) {
			try {
				const point = this.#measurementAnchor(
					coordinate,
					drawing.source.paneId,
					drawing.start === undefined ? '/drawings/start' : '/drawings/end',
				);
				if (drawing.start === undefined) {
					drawing.start = point;
					return;
				}
				event.stopImmediatePropagation();
				this.#completeInteractivePriceMeasurement(drawing, point);
				return;
			} catch (error) {
				if (error instanceof SceneError) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				throw error;
			}
		}
		const hit = hitTestOverlayGeometries(coordinate, this.#overlayGeometries());
		if (hit === null) {
			const selected = this.#drawings.find((overlay) => overlay.id === this.#selectedOverlayId);
			if (selected !== undefined && isControlledInteractionOverlay(selected)) {
				this.#selectOverlay(null);
			}
			return;
		}
		const before = this.#drawings.find((overlay) => overlay.id === hit.overlayId);
		if (before === undefined) {
			return;
		}
		this.#selectOverlay(before.id);
		if (!isControlledInteractionOverlay(before)) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		if (hit.locked) {
			return;
		}
		this.#container.setPointerCapture(event.pointerId);
		this.#interactionDimensions = this.#timeSeriesDimensionsForHit(before, hit);
		this.#pointerInteraction = {
			pointerId: event.pointerId,
			originClient: coordinate,
			originData: this.#fromPixel(coordinate, before.paneId),
			hit,
			before: structuredClone(before),
			interactionId: `interaction-${this.#interactionSequence++}`,
			started: false,
		};
	};

	readonly #handlePointerMove = (event: PointerEvent): void => {
		const interaction = this.#pointerInteraction;
		if (interaction === undefined || interaction.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		const coordinate = (() => {
			const rect = this.#container.getBoundingClientRect();
			return { x: event.clientX - rect.left, y: event.clientY - rect.top };
		})();
		if (
			!interaction.started &&
			Math.hypot(
				coordinate.x - interaction.originClient.x,
				coordinate.y - interaction.originClient.y,
			) < 0.5
		) {
			return;
		}
		interaction.started = true;
		try {
			const candidate = createDragCandidate(
				interaction.before,
				interaction.hit,
				interaction.originData,
				this.#fromPixel(coordinate, interaction.before.paneId),
				this.#scene.data.map((bar) => bar.timestamp),
				this.#pricePrecision,
			);
			const index = this.#drawings.findIndex((overlay) => overlay.id === candidate.id);
			const drawings = structuredClone(this.#drawings);
			drawings[index] = candidate;
			if (index < 0 || !this.#chart.overrideOverlay(toEngineOverlay(
				candidate,
				this.#overlayIdMap,
				`/drawings/${index}`,
				this.#overlayCallbacks(candidate),
			))) {
				throw adapterError(`KLineCharts failed to preview Drawing ${candidate.id}.`);
			}
			interaction.candidate = candidate;
			this.#drawings = drawings;
		} catch (error) {
			if (error instanceof SceneError) {
				throw error;
			}
			throw error;
		}
	};

	readonly #handlePointerUp = (event: PointerEvent): void => {
		const interaction = this.#pointerInteraction;
		if (interaction === undefined || interaction.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.#pointerInteraction = undefined;
		this.#interactionDimensions = { horizontal: false, vertical: false };
		if (!interaction.started) {
			return;
		}
		if (this.#container.hasPointerCapture(event.pointerId)) {
			this.#container.releasePointerCapture(event.pointerId);
		}
		const overlay = interaction.candidate ?? interaction.before;
		const index = this.#drawings.findIndex((candidate) => candidate.id === overlay.id);
		if (index >= 0) {
			const drawings = structuredClone(this.#drawings);
			drawings[index] = overlay;
			this.#drawings = drawings;
			if (this.#workspaceMode) {
				const source = this.#workspaceSources.get(overlay.id);
				if (source !== undefined) {
					const updated = sceneOverlayToDrawing(overlay, source);
					this.#workspaceSources.set(overlay.id, updated);
					this.#emitPort({
						type: 'updated',
						id: overlay.id,
						drawing: timeSeriesSnapshotOfDrawing(updated),
						editDimensions: structuredClone(this.#interactionDimensions),
					});
				}
			}
		}
	};

	readonly #handlePointerCancel = (event: PointerEvent): void => {
		const interaction = this.#pointerInteraction;
		if (interaction === undefined || interaction.pointerId !== event.pointerId) {
			return;
		}
		this.#pointerInteraction = undefined;
		this.#interactionDimensions = { horizontal: false, vertical: false };
		if (this.#container.hasPointerCapture(event.pointerId)) {
			this.#container.releasePointerCapture(event.pointerId);
		}
	};

	#installInteractionListeners(): void {
		this.#container.addEventListener('mousedown', this.#handleRightMouseDown, true);
		this.#container.addEventListener('contextmenu', this.#handleContextMenu, true);
		this.#container.addEventListener('pointerdown', this.#handlePointerDown, true);
		this.#container.addEventListener('pointermove', this.#handlePointerMove, true);
		this.#container.addEventListener('pointerup', this.#handlePointerUp, true);
		this.#container.addEventListener('pointercancel', this.#handlePointerCancel, true);
		window.addEventListener('keydown', this.#handleKeyDown);
		window.addEventListener('blur', this.#handleWindowBlur);
	}

	#removeInteractionListeners(): void {
		this.#container.removeEventListener('mousedown', this.#handleRightMouseDown, true);
		this.#container.removeEventListener('contextmenu', this.#handleContextMenu, true);
		this.#container.removeEventListener('pointerdown', this.#handlePointerDown, true);
		this.#container.removeEventListener('pointermove', this.#handlePointerMove, true);
		this.#container.removeEventListener('pointerup', this.#handlePointerUp, true);
		this.#container.removeEventListener('pointercancel', this.#handlePointerCancel, true);
		window.removeEventListener('keydown', this.#handleKeyDown);
		window.removeEventListener('blur', this.#handleWindowBlur);
	}

	readonly #handleRightMouseDown = (event: MouseEvent): void => {
		if (event.button === 2) {
			event.stopPropagation();
		}
	};

	readonly #handleContextMenu = (event: MouseEvent): void => {
		event.stopPropagation();
	};

	readonly #handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			const interaction = this.#pointerInteraction;
			this.#pointerInteraction = undefined;
			if (
				interaction !== undefined &&
				this.#container.hasPointerCapture(interaction.pointerId)
			) {
				this.#container.releasePointerCapture(interaction.pointerId);
			}
		}
	};

	readonly #handleWindowBlur = (): void => {
		if (this.#pointerInteraction !== undefined) {
			this.#pointerInteraction = undefined;
			this.#selectedOverlayId = null;
		}
	};

	public get sceneKind(): 'chart' | 'time-series' {
		return 'time-series';
	}

	public restoreDrawings(
		drawings: readonly EngineDrawingSnapshot[],
	): void {
		this.#assertActive();
		if (!this.#workspaceMode) {
			throw adapterError('Drawing port operations require the Workspace factory.');
		}
		this.#restoreWorkspaceDrawings(drawings);
	}

	public startDrawing(request: EngineDrawingStartRequest): string {
		this.#assertActive();
		const drawing = timeSeriesPlaceholderDrawing(request);
		if (this.#workspaceSources.has(request.id)) {
			throw new TimeSeriesSceneError(
				'TIME_SERIES_SCENE_SCHEMA_INVALID',
				`/drawings/${request.id}`,
				`Drawing ${request.id} already exists.`,
			);
		}
		this.#workspaceSources.set(request.id, drawing);
		const overlay = drawingToSceneOverlay(drawing, TIME_SERIES_PANE_ID);
		const result = this.#chart.createOverlay(
			toEngineOverlayDrawing(
				{
					...structuredClone(request),
					...structuredClone(overlay),
				},
				this.#overlayIdMap,
				this.#overlayCallbacks(overlay, true),
			),
		);
		if (result !== request.id) {
			this.#workspaceSources.delete(request.id);
			throw adapterError(`KLineCharts failed to start Drawing ${request.id}.`);
		}
		return request.id;
	}

	public listDrawings(): readonly EngineDrawingSnapshot[] {
		this.#assertActive();
		return Array.from(
			this.#workspaceSources.values(),
			(drawing) => timeSeriesSnapshotOfDrawing(drawing),
		);
	}

	public getDrawing(id: string): EngineDrawingSnapshot | undefined {
		this.#assertActive();
		const drawing = this.#workspaceSources.get(id);
		return drawing === undefined ? undefined : timeSeriesSnapshotOfDrawing(drawing);
	}

	public updateDrawingStyles(
		id: string,
		styles: Drawing['styles'],
	): EngineDrawingSnapshot {
		this.#assertActive();
		const source = this.#workspaceSources.get(id);
		if (source === undefined) {
			throw new TimeSeriesSceneError(
				'TIME_SERIES_SCENE_SCHEMA_INVALID',
				`/drawings/${id}`,
				`Drawing ${id} does not exist.`,
			);
		}
		if (!this.#chart.overrideOverlay({
			id,
			styles: toOverlayStyles(styles),
		})) {
			throw adapterError(`KLineCharts failed to update Drawing ${id} styles.`);
		}
		const updated = {
			...structuredClone(source),
			styles: structuredClone(styles),
		} as unknown as Drawing;
		this.#workspaceSources.set(id, updated);
		this.#drawings = this.#drawings.map((candidate) =>
			candidate.id === id
				? drawingToSceneOverlay(updated, TIME_SERIES_PANE_ID)
				: candidate,
		);
		this.#emitPort({
			type: 'updated',
			id,
			drawing: timeSeriesSnapshotOfDrawing(updated),
			editDimensions: { horizontal: false, vertical: false },
		});
		return timeSeriesSnapshotOfDrawing(updated);
	}

	public updateDrawingText(id: string, text: string): EngineDrawingSnapshot {
		this.#assertActive();
		const source = this.#workspaceSources.get(id);
		if (source === undefined) {
			throw new TimeSeriesSceneError(
				'TIME_SERIES_SCENE_SCHEMA_INVALID',
				`/drawings/${id}`,
				`Drawing ${id} does not exist.`,
			);
		}
		if (!this.#chart.overrideOverlay({ id, extendData: text })) {
			throw adapterError(`KLineCharts failed to update Drawing ${id} text.`);
		}
		const updated = timeSeriesWithDrawingText(
			structuredClone(source),
			text,
		);
		this.#workspaceSources.set(id, updated);
		this.#drawings = this.#drawings.map((candidate) =>
			candidate.id === id
				? drawingToSceneOverlay(updated, TIME_SERIES_PANE_ID)
				: candidate,
		);
		this.#emitPort({
			type: 'updated',
			id,
			drawing: timeSeriesSnapshotOfDrawing(updated),
			editDimensions: { horizontal: false, vertical: false },
		});
		return timeSeriesSnapshotOfDrawing(updated);
	}

	public updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot {
		this.#assertActive();
		const source = this.#workspaceSources.get(id);
		if (source === undefined) {
			throw new TimeSeriesSceneError(
				'TIME_SERIES_SCENE_SCHEMA_INVALID',
				`/drawings/${id}`,
				`Drawing ${id} does not exist.`,
			);
		}
		if (!this.#chart.overrideOverlay({ id, lock: locked })) {
			throw adapterError(`KLineCharts failed to update Drawing ${id} lock state.`);
		}
		const updated = {
			...structuredClone(source),
			locked,
		} as unknown as Drawing;
		this.#workspaceSources.set(id, updated);
		this.#drawings = this.#drawings.map((candidate) =>
			candidate.id === id
				? drawingToSceneOverlay(updated, TIME_SERIES_PANE_ID)
				: candidate,
		);
		const snapshot = timeSeriesSnapshotOfDrawing(updated);
		this.#emitPort({
			type: 'updated',
			id,
			drawing: snapshot,
			editDimensions: { horizontal: false, vertical: false },
		});
		return snapshot;
	}

	public removeDrawing(id: string): boolean {
		this.#assertActive();
		return this.#chart.removeOverlay({ id });
	}

	public restoreDrawing(snapshot: EngineDrawingSnapshot): void {
		this.#assertActive();
		const drawing = timeSeriesDrawingFromSnapshot(snapshot);
		const existing = this.#drawings.find(
			(overlay) => overlay.id === drawing.id,
		);
		const overlay = drawingToSceneOverlay(drawing, TIME_SERIES_PANE_ID);
		if (existing !== undefined) {
			if (!this.#chart.overrideOverlay(
				toEngineOverlay(
					overlay,
					this.#overlayIdMap,
					`/drawings/${drawing.id}`,
					this.#overlayCallbacks(overlay),
				),
			)) {
				throw adapterError(`KLineCharts failed to restore Drawing ${drawing.id}.`);
			}
			return;
		}
		const result = this.#chart.createOverlay(
			toEngineOverlay(
				overlay,
				this.#overlayIdMap,
				`/drawings/${drawing.id}`,
				this.#overlayCallbacks(overlay),
			),
		);
		if (result !== drawing.id) {
			throw adapterError(`KLineCharts failed to restore Drawing ${drawing.id}.`);
		}
	}

	public selectDrawing(id: string | null): void {
		this.#assertActive();
		this.#selectOverlay(id);
	}

	public hitTestDrawing(point: EnginePixelCoordinate): string | null {
		this.#assertActive();
		const result = hitTestOverlayGeometries(point, this.#overlayGeometries());
		return result === null ? null : result.overlayId;
	}

	public projectToPixel(
		anchor: { readonly timestamp?: number; readonly value?: number },
		_paneRole: string,
	): EnginePointProjection {
		this.#assertActive();
		return this.#toPixel(anchor, TIME_SERIES_PANE_ID);
	}

	public unprojectFromPixel(
		point: EnginePixelCoordinate,
		_paneRole: string,
	): EnginePointProjection {
		this.#assertActive();
		return this.#fromPixelToData(point);
	}

	public setMutationsEnabled(enabled: boolean): void {
		this.#assertActive();
		this.#mutationsEnabled = enabled;
	}

	public subscribeDrawingEvents(
		listener: (event: EngineDrawingEvent) => void,
	): () => void {
		this.#portListeners.add(listener);
		return () => {
			this.#portListeners.delete(listener);
		};
	}

	public subscribeCrosshair(
		listener: TimeSeriesAdapterCrosshairListener,
	): () => void {
		this.#assertActive();
		this.#crosshairListeners.add(listener);
		return () => this.#crosshairListeners.delete(listener);
	}

	public setSeriesVisible(seriesId: string, visible: boolean): TimeSeriesScene {
		this.#assertActive();
		const index = this.#scene.series.findIndex((series) => series.id === seriesId);
		if (index < 0) {
			throw new TimeSeriesSceneError(
				'TIME_SERIES_UNKNOWN_SERIES',
				'/series',
				`Unknown time series: ${seriesId}.`,
			);
		}
		const series = structuredClone(this.#scene.series);
		series[index] = { ...series[index]!, visible };
		const candidate = parseTimeSeriesScene({
			...structuredClone(this.#scene),
			series,
		});
		const indicatorId = `baron_time_series_${seriesId}`;
		const matches = this.#chart.getIndicators({ id: indicatorId });
		if (matches.length !== 1) {
			throw adapterError(
				`KLineCharts retained ${matches.length} indicators for series ${seriesId}.`,
			);
		}
		this.#chart.overrideIndicator({
			id: indicatorId,
			name: TIME_SERIES_INDICATOR_NAME,
			visible,
		});
		const afterVisible = this.#chart.getIndicators({ id: indicatorId })[0]?.visible;
		if (afterVisible !== visible) {
			throw adapterError(`KLineCharts failed to update series ${seriesId}.`);
		}
		this.#scene = candidate;
		this.#updateAxisVisibility();
		return structuredClone(candidate);
	}

	public replaceData(data: readonly TimeSeriesPoint[]): TimeSeriesScene {
		this.#assertActive();
		const last = data.at(-1);
		let candidate: TimeSeriesScene;
		try {
			candidate = parseTimeSeriesScene({
				...structuredClone(this.#scene),
				data: structuredClone(data),
				viewport: {
					...structuredClone(this.#scene.viewport),
					anchorTimestamp: last?.timestamp,
				},
			});
		} catch (error) {
			throw error instanceof TimeSeriesSceneError
				? dataError(error)
				: adapterError('Time Series replacement data validation failed.');
		}
		const previous = this.#scene;
		const previousPointByTimestamp = this.#pointByTimestamp;
		const candidatePointByTimestamp = new Map(
			candidate.data.map((point) => [point.timestamp, point]),
		);
		try {
			this.#chart.setDataLoader(dataLoader(candidate.data));
			this.#chart.resetData();
			this.#scene = candidate;
			this.#pointByTimestamp = candidatePointByTimestamp;
			this.#updateAxisVisibility();
			applyViewport(this.#chart, candidate.viewport);
			return structuredClone(candidate);
		} catch (error) {
			this.#chart.setDataLoader(dataLoader(previous.data));
			this.#chart.resetData();
			this.#scene = previous;
			this.#pointByTimestamp = previousPointByTimestamp;
			this.#updateAxisVisibility();
			throw error instanceof TimeSeriesSceneError
				? error
				: adapterError('KLineCharts failed to replace Time Series data.');
		}
	}

	/** 同结构场景替换：period/data/viewport 原子更新，series 结构必须一致。 */
	public replaceScene(value: TimeSeriesScene): TimeSeriesScene {
		this.#assertActive();
		const candidate = parseTimeSeriesScene(value);
		const seriesShape = (scene: TimeSeriesScene): string =>
			JSON.stringify(scene.series.map((series) => series.id));
		if (seriesShape(candidate) !== seriesShape(this.#scene)) {
			throw new TimeSeriesSceneError(
				'TIME_SERIES_SCENE_SCHEMA_INVALID',
				'/series',
				'Scene replacement requires identical series ids.',
			);
		}
		const previous = this.#scene;
		const previousBackground = this.#container.style.backgroundColor;
		try {
			this.#chart.setPeriod(structuredClone(candidate.period));
			this.#chart.setDataLoader(dataLoader(candidate.data));
			this.#chart.resetData();
			this.#pointByTimestamp = new Map(
				candidate.data.map((point) => [point.timestamp, point]),
			);
			this.#updateAxisVisibility();
			applyViewport(this.#chart, candidate.viewport);
			this.#scene = candidate;
			this.#container.style.backgroundColor =
				candidate.chart.layout.backgroundColor;
			return structuredClone(candidate);
		} catch (error) {
			try {
				this.#chart.setPeriod(structuredClone(previous.period));
				this.#chart.setDataLoader(dataLoader(previous.data));
				this.#chart.resetData();
				this.#pointByTimestamp = new Map(
					previous.data.map((point) => [point.timestamp, point]),
				);
				this.#updateAxisVisibility();
				applyViewport(this.#chart, previous.viewport);
				this.#container.style.backgroundColor = previousBackground;
			} catch {
				// 回滚失败：保留原错误。
			}
			throw error;
		}
	}

	public exportScene(): TimeSeriesScene {
		this.#assertActive();
		return parseTimeSeriesScene(structuredClone(this.#scene));
	}

	public dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#removeInteractionListeners();
		this.#chart.unsubscribeAction('onCrosshairChange', this.#handleCrosshair);
		this.#interactiveRoot.removeEventListener(
			'pointerleave',
			this.#handlePointerLeave,
		);
		this.#crosshairListeners.clear();
		this.#pointByTimestamp.clear();
		this.#portListeners.clear();
		this.#workspaceSources.clear();
		this.#drawings = [];
		this.#engine.dispose(this.#container);
		this.#container.replaceChildren();
		this.#container.style.backgroundColor = this.#originalBackground;
	}
}

function isControlledInteractionOverlay(overlay: SceneOverlay): boolean {
	return overlay.type === 'horizontalStraightLine' || overlay.type === 'priceMeasurement';
}

function timeSeriesSnapshotOfDrawing(drawing: Drawing): EngineDrawingSnapshot {
	return {
		id: drawing.id,
		type: drawing.type,
		...(drawing.groupId === undefined ? {} : { groupId: drawing.groupId }),
		target: structuredClone(drawing.target) as EngineDrawingSnapshot['target'],
		geometry: structuredClone(drawing.geometry),
		styles: structuredClone(drawing.styles),
		...(drawing.metadata === undefined
			? {}
			: { metadata: structuredClone(drawing.metadata) }),
		locked: drawing.locked,
		visible: drawing.visible,
		zLevel: drawing.zLevel,
		mode: drawing.mode,
	};
}

function timeSeriesDrawingFromSnapshot(
	snapshot: EngineDrawingSnapshot,
): Drawing {
	return {
		id: snapshot.id,
		type: snapshot.type,
		...(snapshot.groupId === undefined ? {} : { groupId: snapshot.groupId }),
		target: structuredClone(snapshot.target),
		geometry: structuredClone(snapshot.geometry),
		styles: structuredClone(snapshot.styles),
		...(snapshot.metadata === undefined
			? {}
			: { metadata: structuredClone(snapshot.metadata) }),
		visible: snapshot.visible,
		locked: snapshot.locked,
		zLevel: snapshot.zLevel,
		mode: snapshot.mode,
	} as unknown as Drawing;
}

function timeSeriesPlaceholderGeometry(
	type: Drawing['type'],
): Drawing['geometry'] {
	switch (type) {
		case 'horizontalStraightLine':
		case 'priceLine':
			return { value: 0 };
		case 'simpleTag':
			return { value: 0, text: '' };
		case 'verticalStraightLine':
			return { time: 0 };
		case 'horizontalRayLine':
		case 'horizontalSegment':
			return { value: 0, startTime: 0, endTime: 0 };
		case 'verticalRayLine':
		case 'verticalSegment':
			return { time: 0, startValue: 0, endValue: 0 };
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
			return {
				points: [
					{ timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
					{ timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
				],
			};
		case 'priceChannelLine':
		case 'parallelStraightLine':
			return {
				points: [
					{ timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
					{ timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
					{ timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
				],
			};
		case 'brush':
			return {
				points: [
					{ timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
					{ timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
				],
			};
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			return {
				point: { timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
				text: '',
			};
		case 'crossLine':
			return {
				point: { timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
			};
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			return {
				start: { timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
				end: { timestamp: 0, granularity: { type: 'day', span: 1 }, value: 0 },
			};
	}
}

function timeSeriesPlaceholderDrawing(
	request: EngineDrawingStartRequest,
): Drawing {
	return {
		id: request.id,
		type: request.type,
		...(request.groupId === undefined ? {} : { groupId: request.groupId }),
		target: structuredClone(request.target),
		geometry: timeSeriesPlaceholderGeometry(request.type),
		styles: structuredClone(request.styles),
		metadata: structuredClone(request.metadata ?? {}),
		visible: true,
		locked: false,
		zLevel: 0,
		mode: 'normal',
	} as unknown as Drawing;
}

function timeSeriesWithDrawingText(
	drawing: Drawing,
	text: string,
): Drawing {
	switch (drawing.type) {
		case 'simpleTag':
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			return {
				...structuredClone(drawing),
				geometry: { ...drawing.geometry, text },
			} as unknown as Drawing;
		default:
			return structuredClone(drawing);
	}
}
