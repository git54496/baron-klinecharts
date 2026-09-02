import type {
	ChartScene,
	DrawableWorkspaceDocument,
	Drawing,
	MarketData,
	SceneIndicator,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import {
	parseDrawableWorkspaceDocument,
	parseChartScene,
	SceneError,
} from '@baron1996/kline-scene-schema';
import type { Chart, Coordinate, Overlay, Point } from 'klinecharts';

import { createEngine, type EngineHandle } from './engine.js';
import { toIndicatorCreate } from './conversion/indicators.js';
import { registerProjectOverlays } from './extensions/register.js';
import {
	createEngineIdMap,
	type EngineIdMap,
} from './conversion/id-map.js';
import { applyPanes, overrideSceneYAxis } from './conversion/panes.js';
import {
	createSceneOverlays,
	type EngineOverlayCallbacks,
	fromEngineOverlay,
	normalizeSceneOverlayPrices,
	type OverlayDrawingSource,
	toEngineOverlay,
	toEngineOverlayDrawing,
} from './conversion/overlays.js';
import { normalizePriceValue } from './conversion/price.js';
import { applyViewport } from './conversion/viewport.js';
import { createStaticDataLoader } from './static-data-loader.js';
import {
	assertGapAwareSceneSupported,
	engineDataForScene,
	GAP_AWARE_CANDLE_INDICATOR_ID,
	gapCount,
	installGapAwareMainSeries,
	isGapAwareScene,
	timelineItemOf,
	timelineSlotCount,
} from './gap-aware-series.js';
import { toOverlayStyles } from './conversion/overlays.js';
import {
	drawingToSceneOverlay,
	sceneOverlayToDrawing,
} from './drawing/overlay-conversion.js';
import type {
	DrawingInteractionOptions,
	DrawingEnginePort,
	EngineDrawingEvent,
	EngineDrawingSnapshot,
	EngineDrawingStartRequest,
	EngineHistoricalDataCommitResult,
	EngineHistoricalDataRequest,
	EnginePixelCoordinate,
	EnginePointProjection,
	HistoricalDataEnginePort,
} from './drawing/engine-port.js';
import type { InteractionDimensions } from './drawing/interaction-normalization.js';
import {
	MainSeriesPresentationError,
	type ActiveMainSeriesType,
	presentationToSceneCandle,
	STANDARD_CLOSE_LINE_PRESENTATION,
	type MainSeriesPresentation,
	type MainSeriesPresentationPort,
	type MainSeriesPresentationResult,
} from './main-series-presentation.js';
import {
	createDragCandidate,
	type DragDataPoint,
} from './interaction/dragging.js';
import {
	DEFAULT_OVERLAY_MOUSE_HIT_TOLERANCE,
	DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE,
	hitTestOverlayGeometries,
	type OverlayHitTolerance,
	type OverlayHitResult,
	type OverlayPixelGeometry,
	type PixelCoordinate,
} from './interaction/hit-testing.js';
import { projectOverlayGeometry } from './interaction/overlay-geometry.js';
import { shouldIgnoreStaleOverlayDeselection } from './interaction/selection-arbitration.js';
import {
	isTouchPrecisionTap,
	resolveTouchPrecisionCursor,
	TouchPrecisionDrawingGuide,
	type TouchPrecisionDrawingPhase,
	type TouchPrecisionPoint,
} from './interaction/touch-precision-drawing.js';

export type PriceScale = 'linear' | 'logarithmic';
export type AdapterDragTarget = 'body' | 'anchor';
export type AdapterDragCancelReason =
	| 'escape'
	| 'pointer-cancel'
	| 'window-blur'
	| 'destroy'
	| 'validation-error';

export interface AdapterIndicatorSnapshot {
	readonly id: string;
	readonly name: SceneIndicator['name'];
	readonly paneId: string;
	readonly yAxisId: string;
}

export interface AdapterCrosshairBar {
	readonly open: number;
	readonly high: number;
	readonly low: number;
	readonly close: number;
	readonly volume: number | null;
}

export interface AdapterCrosshairSnapshot {
	readonly timestamp: number | null;
	readonly bar: AdapterCrosshairBar | null;
}

export type AdapterCrosshairListener = (
	snapshot: AdapterCrosshairSnapshot,
) => void;

export interface AdapterSnapshot {
	readonly engineVersion: string;
	readonly runtimeVersion: ChartScene['runtime']['runtimeVersion'];
	readonly dataCount: number;
	readonly timelineSlotCount: number;
	readonly gapCount: number;
	readonly paneIds: readonly string[];
	readonly indicators: readonly AdapterIndicatorSnapshot[];
	readonly overlays: readonly SceneOverlay[];
	readonly barSpace: number;
	readonly rightOffsetDistance: number;
}

interface AdapterDragEventIdentity {
	readonly interactionId: string;
	readonly overlayId: string;
	readonly target: AdapterDragTarget;
	readonly anchorIndex: number | null;
	readonly before: SceneOverlay;
}

export type AdapterSceneEvent =
	| { readonly type: 'overlay-created'; readonly overlay: SceneOverlay }
	| { readonly type: 'indicator-created'; readonly indicator: SceneIndicator }
	| { readonly type: 'indicator-removed'; readonly id: string }
	| { readonly type: 'overlay-updated'; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-style-changed'; readonly before: SceneOverlay; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-removed'; readonly id: string }
	| { readonly type: 'overlay-selection-changed'; readonly previousId: string | null; readonly id: string | null }
	| { readonly type: 'overlay-selected'; readonly id: string }
	| ({ readonly type: 'overlay-drag-started' } & AdapterDragEventIdentity)
	| ({ readonly type: 'overlay-dragging'; readonly candidate: SceneOverlay } & AdapterDragEventIdentity)
	| ({ readonly type: 'overlay-drag-committed'; readonly overlay: SceneOverlay } & AdapterDragEventIdentity)
	| ({ readonly type: 'overlay-drag-cancelled'; readonly reason: AdapterDragCancelReason } & AdapterDragEventIdentity)
	| { readonly type: 'crosshair-changed'; readonly timestamp: number | null; readonly bar: AdapterCrosshairBar | null }
	| { readonly type: 'scene-error'; readonly issues: readonly SceneError['issues'][number][] };

export type AdapterSceneEventListener = (event: AdapterSceneEvent) => void;

export interface OverlayDrawingRequest extends OverlayDrawingSource {}

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

interface TouchPrecisionDrawingState {
	readonly id: string;
	readonly paneId: string;
	phase: TouchPrecisionDrawingPhase;
}

interface TouchPrecisionPointerInteraction {
	readonly pointerId: number;
	readonly origin: TouchPrecisionPoint;
	current: TouchPrecisionPoint;
}

interface ChartInteractionSnapshot {
	readonly scrollEnabled: boolean;
	readonly zoomEnabled: boolean;
	readonly crosshairVisible: boolean;
}

interface InteractivePriceMeasurement {
	readonly source: OverlayDrawingSource & { readonly type: 'priceMeasurement' };
	start?: NonNullable<SceneOverlay['start']>;
}

function promoteSceneToM2(
	scene: ChartScene,
	scale?: PriceScale,
): ChartScene {
	const candidate = structuredClone(scene);
	candidate.runtime.runtimeVersion = '0.2.0';
	for (const pane of candidate.panes) {
		for (const axis of pane.yAxes) {
			axis.scale =
				pane.kind === 'candle' && axis.role === 'primary' && scale !== undefined
					? scale
					: axis.scale ?? 'linear';
		}
	}
	return candidate;
}

function isControlledInteractionOverlay(overlay: SceneOverlay): boolean {
	return overlay.type === 'horizontalStraightLine' || overlay.type === 'priceMeasurement';
}

/**
 * ChartScene 与 KLineCharts 之间的唯一边界。
 * 引擎对象和内部 ID 永不从该类的公共接口泄露。
 */
export class KLineChartsSceneAdapter implements DrawingEnginePort, HistoricalDataEnginePort, MainSeriesPresentationPort {
	/** KLineCharts 实例，仅在 Adapter 内部使用。 */
	readonly #chart: Chart;
	/** 引擎模块句柄，用于版本读取和精确销毁。 */
	readonly #engine: EngineHandle['module'];
	/** 引擎点击仲裁显式复位；每次绘制开始前调用，保证新绘制首击独立成单击。 */
	readonly #resetClickArbitration: () => void;
	/** 向引擎派发鼠标移动语义，供触摸虚拟光标复用原生绘制预览。 */
	readonly #dispatchEngineMouseMove: EngineHandle['dispatchMouseMove'];
	/** 向引擎派发鼠标单击语义，供触摸轻点复用原生绘制落点。 */
	readonly #dispatchEngineMouseClick: EngineHandle['dispatchMouseClick'];
	/** 引擎十字线动作监听器集合。 */
	readonly #crosshairListeners = new Set<AdapterCrosshairListener>();
	/** 引擎十字线动作退订函数。 */
	#unsubscribeCrosshair: (() => void) | null = null;
	/** 引擎十字线动作的绑定处理函数。 */
	readonly #handleCrosshairChange = (payload: unknown): void => {
		if (this.#chartInteractionSnapshot !== undefined) {
			return;
		}
		const event = (typeof payload === 'object' && payload !== null
			? payload
			: {}) as {
			readonly dataIndex?: number;
			readonly timestamp?: number;
		};
		const data = this.#chart.getDataList();
		const store = (this.#chart as unknown as {
			readonly _chartStore?: {
				readonly _crosshair?: {
					readonly dataIndex?: number;
					readonly timestamp?: number;
				};
			};
		})._chartStore;
		const current = store?._crosshair;
		let barIndex: number | null = null;
		if (
			typeof event.dataIndex === 'number' &&
			event.dataIndex >= 0 &&
			event.dataIndex < data.length
		) {
			barIndex = event.dataIndex;
		} else if (
			current !== undefined &&
			typeof current.dataIndex === 'number' &&
			current.dataIndex >= 0 &&
			current.dataIndex < data.length
		) {
			barIndex = current.dataIndex;
		} else if (
			current !== undefined &&
			typeof current.timestamp === 'number'
		) {
			const index = data.findIndex(
				(item) => item.timestamp === current.timestamp,
			);
			if (index >= 0) {
				barIndex = index;
			}
		}
		const match = barIndex === null ? undefined : data[barIndex];
		const timestamp = match?.timestamp ?? null;
		const timelineItem = timelineItemOf(match);
		const source = timelineItem?.kind === 'bar' ? timelineItem.bar : match;
		const bar: AdapterCrosshairBar | null =
			source === undefined || timelineItem?.kind === 'gap'
				? null
				: {
						open: source.open,
						high: source.high,
						low: source.low,
						close: source.close,
						volume: source.volume ?? null,
					};
		const snapshot: AdapterCrosshairSnapshot = { timestamp, bar };
		for (const listener of this.#crosshairListeners) {
			listener(structuredClone(snapshot));
		}
	};
	/** 场景 ID 与引擎内部 ID 的双向映射。 */
	readonly #idMap: EngineIdMap;
	/** 当前最后一次成功提交、可导出的规范化场景。 */
	#scene: ChartScene;
	/** 当前引擎容器。 */
	readonly #container: HTMLElement;
	/** 创建前容器的内联背景，销毁后恢复。 */
	readonly #originalBackground: string;
	/** 防止重复调用 KLineCharts dispose。 */
	#disposed = false;
	/** 仅传递纯场景数据的事件订阅者。 */
	readonly #listeners = new Set<AdapterSceneEventListener>();
	/** 当前选择状态，null 表示明确未选择。 */
	#selectedOverlayId: string | null = null;
	/** 独占选择前的图表交互状态，用于无损恢复宿主原配置。 */
	#chartInteractionSnapshot: ChartInteractionSnapshot | undefined;
	/** 点击空白退出编辑时被完整消费的 Pointer ID。 */
	#deselectingPointerId: number | undefined;
	/** 当前受控拖动事务；progress 永不写入 #scene。 */
	#pointerInteraction: PointerInteraction | undefined;
	/** 当前交互式量度的首锚点；只用于补偿引擎丢弃快速第二击，不进入 Scene。 */
	#interactivePriceMeasurement: InteractivePriceMeasurement | undefined;
	/** 当前引擎进行中的绘制 Overlay ID；非 null 时 pointerdown 只路由给新绘制，不做命中测试。 */
	#drawingInProgressId: string | null = null;
	/** 宿主显式开启的 Drawing 输入策略；未配置时保持引擎原生行为。 */
	readonly #drawingInteraction: DrawingInteractionOptions;
	/** 触摸精确绘制的通用提示与虚拟光标层。 */
	#touchPrecisionGuide: TouchPrecisionDrawingGuide | undefined;
	/** 当前允许切换到触摸精确交互的线段绘制。 */
	#touchPrecisionDrawing: TouchPrecisionDrawingState | undefined;
	/** 当前单指定位手势；拖动只更新光标，轻点才确认。 */
	#touchPrecisionPointer: TouchPrecisionPointerInteraction | undefined;
	/** 阻断触摸结束后浏览器补发的兼容鼠标事件。 */
	#suppressCompatibilityMouseUntil = 0;
	/** 确定性 opaque 交互 ID 序号。 */
	#interactionSequence = 0;
	/** 显式 Workspace 模式；Legacy 与 Workspace 状态严格隔离。 */
	#workspaceMode = false;
	/** Workspace 模式与引擎同步的 Overlay 几何（不写入 #scene.overlays）。 */
	#workspaceOverlays: SceneOverlay[] = [];
	/** Workspace 模式权威业务 Drawing（含 granularity/target/text）。 */
	#workspaceSources = new Map<string, Drawing>();
	/** 公共 Drawing 端口监听器。 */
	readonly #portListeners = new Set<(event: EngineDrawingEvent) => void>();
	/** 更早行情请求监听器；仅传递纯数据请求。 */
	readonly #historicalDataListeners = new Set<(
		request: EngineHistoricalDataRequest,
	) => void>();
	/** 历史行情加载开关及服务端是否仍可能存在更早数据。 */
	#historicalDataLoading: { hasMore: boolean } | undefined;
	/** 当前唯一待完成的历史行情请求，防止重复并发前插。 */
	#pendingHistoricalData: {
		readonly request: EngineHistoricalDataRequest;
		readonly callback: import('klinecharts').DataLoaderGetBarsParams['callback'];
	} | undefined;
	/** 历史行情请求期间冻结平移前的宿主滚动状态。 */
	#historicalScrollEnabled: boolean | undefined;
	/** 历史行情请求的单调序号。 */
	#historicalDataSequence = 0;
	/** 交互启用开关。 */
	#mutationsEnabled = true;
	/** 主序列回滚失败后的只能销毁终止态。 */
	#terminated = false;
	/** 当前拖动会话的编辑维度。 */
	#interactionDimensions: InteractionDimensions = {
		horizontal: false,
		vertical: false,
	};

	private constructor(
		container: HTMLElement,
		scene: ChartScene,
		handle: EngineHandle,
		idMap: EngineIdMap,
		originalBackground: string,
		drawingInteraction: DrawingInteractionOptions = {},
	) {
		this.#container = container;
		this.#scene = scene;
		this.#chart = handle.chart;
		this.#engine = handle.module;
		this.#resetClickArbitration = handle.resetClickArbitration;
		this.#dispatchEngineMouseMove = handle.dispatchMouseMove;
		this.#dispatchEngineMouseClick = handle.dispatchMouseClick;
		this.#idMap = idMap;
		this.#originalBackground = originalBackground;
		this.#drawingInteraction = structuredClone(drawingInteraction);
		this.#hitTolerance('mouse');
		this.#hitTolerance('touch');
		this.#installInteractionListeners();
		this.#chart.subscribeAction('onCrosshairChange', this.#handleCrosshairChange);
		this.#unsubscribeCrosshair = () => {
			this.#chart.unsubscribeAction('onCrosshairChange', this.#handleCrosshairChange);
		};
	}

	public static async create(
		container: HTMLElement,
		value: unknown,
	): Promise<KLineChartsSceneAdapter> {
		const scene = parseChartScene(value);
		const originalBackground = container.style.backgroundColor;
		let handle: EngineHandle | undefined;
		let adapter: KLineChartsSceneAdapter | undefined;
		try {
			handle = await createEngine(container, scene);
			installGapAwareMainSeries(
				scene,
				handle.chart,
				handle.module.registerIndicator,
			);
			registerProjectOverlays(handle.module.registerOverlay);
			const idMap = createEngineIdMap(scene, handle.chart);
			applyPanes(scene, handle.chart, idMap);
			adapter = new KLineChartsSceneAdapter(
				container,
				scene,
				handle,
				idMap,
				originalBackground,
			);
			createSceneOverlays(
				scene,
				handle.chart,
				idMap,
				(overlay) => adapter === undefined ? {} : adapter.#overlayCallbacks(overlay),
			);
			applyViewport(handle.chart, scene.viewport);
			container.style.backgroundColor = scene.chart.layout.backgroundColor;
			return adapter;
		} catch (error) {
			if (adapter !== undefined) {
				adapter.dispose();
			} else if (handle !== undefined) {
				handle.module.dispose(container);
			}
			container.replaceChildren();
			container.style.backgroundColor = originalBackground;
			throw error;
		}
	}

	/** 显式 Workspace factory：非空 Legacy overlays 由工作区语义校验拒绝。 */
	public static async createWorkspace(
		container: HTMLElement,
		value: unknown,
		options?: {
			readonly historicalDataLoading?: { readonly hasMore: boolean };
			readonly displayTimezone?: string;
			readonly drawingInteraction?: DrawingInteractionOptions;
		},
	): Promise<KLineChartsSceneAdapter> {
		const workspace = parseDrawableWorkspaceDocument(value);
		if (workspace.scene.kind !== 'chart') {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/scene/kind',
				'KLineChartsSceneAdapter requires a chart Workspace Scene.',
			);
		}
		const scene = workspace.scene.document;
		const originalBackground = container.style.backgroundColor;
		let handle: EngineHandle | undefined;
		let adapter: KLineChartsSceneAdapter | undefined;
		try {
			handle = await createEngine(container, scene, {
				...(options?.displayTimezone === undefined
					? {}
					: { displayTimezone: options.displayTimezone }),
			});
			installGapAwareMainSeries(
				scene,
				handle.chart,
				handle.module.registerIndicator,
			);
			registerProjectOverlays(handle.module.registerOverlay);
			const idMap = createEngineIdMap(scene, handle.chart);
			applyPanes(scene, handle.chart, idMap);
			adapter = new KLineChartsSceneAdapter(
				container,
				scene,
				handle,
				idMap,
				originalBackground,
				options?.drawingInteraction,
			);
			applyViewport(handle.chart, scene.viewport);
			container.style.backgroundColor = scene.chart.layout.backgroundColor;
			adapter.#workspaceMode = true;
			if (options?.historicalDataLoading !== undefined) {
				adapter.configureHistoricalDataLoading(
					options.historicalDataLoading.hasMore,
				);
			}
			adapter.#restoreWorkspaceDrawings(
				workspace.drawings.drawings.map((drawing) => snapshotOfDrawing(drawing)),
			);
			return adapter;
		} catch (error) {
			if (adapter !== undefined) {
				adapter.dispose();
			} else if (handle !== undefined) {
				handle.module.dispose(container);
			}
			container.replaceChildren();
			container.style.backgroundColor = originalBackground;
			throw error;
		}
	}

	#assertActive(): void {
		if (this.#disposed) {
			throw new SceneError('RUNTIME_INIT_FAILED', '/', 'The Adapter has already been disposed.');
		}
	}

	#assertNotTerminated(): void {
		if (this.#terminated) {
			throw new MainSeriesPresentationError(
				'MAIN_SERIES_PRESENTATION_ROLLBACK_FAILED',
				'/chart/candle',
				'Adapter is in a destroy-only terminal error state.',
			);
		}
	}

	/** 当前模式下的 Overlay 列表：Legacy 用 #scene.overlays，Workspace 用独立状态。 */
	#activeOverlays(): SceneOverlay[] {
		return this.#workspaceMode ? this.#workspaceOverlays : this.#scene.overlays;
	}

	/** 提交 Overlay 列表变更；Workspace 模式不触碰 #scene.overlays。 */
	#setActiveOverlays(next: readonly SceneOverlay[]): void {
		if (this.#workspaceMode) {
			this.#workspaceOverlays = structuredClone(next) as SceneOverlay[];
			this.#syncWorkspaceSources();
			return;
		}
		this.#scene = parseChartScene({
			...structuredClone(this.#scene),
			overlays: structuredClone(next),
		});
	}

	#syncWorkspaceSources(): void {
		const next = new Map<string, Drawing>();
		for (const overlay of this.#workspaceOverlays) {
			const source = this.#workspaceSources.get(overlay.id);
			if (source === undefined) {
				continue;
			}
			next.set(overlay.id, sceneOverlayToDrawing(overlay, source));
		}
		this.#workspaceSources = next;
	}

	#paneIdFor(paneRole: string): string {
		if (paneRole === 'candle') {
			const pane = this.#scene.panes.find((candidate) => candidate.kind === 'candle');
			if (pane === undefined) {
				throw new SceneError(
					'INVALID_REFERENCE',
					'/panes',
					'Candle pane is missing.',
				);
			}
			return pane.id;
		}
		if (paneRole.startsWith('indicator:')) {
			const indicatorId = paneRole.slice('indicator:'.length);
			const pane = this.#scene.panes.find((candidate) =>
				candidate.indicators.some((indicator) => indicator.id === indicatorId),
			);
			if (pane === undefined) {
				throw new SceneError(
					'INVALID_REFERENCE',
					'/panes',
					`Indicator pane is missing: ${indicatorId}.`,
				);
			}
			return pane.id;
		}
		throw new SceneError(
			'INVALID_REFERENCE',
			'/drawings/target',
			`Cannot map pane role: ${paneRole}.`,
		);
	}

	#emitPort(event: EngineDrawingEvent): void {
		for (const listener of this.#portListeners) {
			listener(structuredClone(event));
		}
	}

	#historicalDataLoader(scene: ChartScene): import('klinecharts').DataLoader {
		const snapshot = structuredClone(engineDataForScene(scene)) as import('klinecharts').KLineData[];
		return {
			getBars: ({ type, timestamp, callback }): void => {
				if (type === 'init') {
					callback(structuredClone(snapshot), {
						forward: this.#historicalDataLoading?.hasMore ?? false,
						backward: false,
					});
					return;
				}
				if (
					type !== 'forward' ||
					this.#historicalDataLoading?.hasMore !== true ||
					timestamp === null
				) {
					callback([], { forward: false, backward: false });
					return;
				}
				if (this.#pendingHistoricalData !== undefined) {
					callback([], { forward: true, backward: false });
					return;
				}
				const request: EngineHistoricalDataRequest = {
					requestId: `historical-data-${++this.#historicalDataSequence}`,
					beforeTimestamp: timestamp,
					period: structuredClone(this.#scene.period),
					dataCount: this.#scene.data.length,
				};
				this.#lockHistoricalScroll();
				this.#pendingHistoricalData = { request, callback };
				for (const listener of this.#historicalDataListeners) {
					listener(structuredClone(request));
				}
			},
		};
	}

	#lockHistoricalScroll(): void {
		if (this.#historicalScrollEnabled === undefined) {
			this.#historicalScrollEnabled =
				this.#chartInteractionSnapshot?.scrollEnabled ??
				this.#chart.isScrollEnabled();
		}
		this.#chart.setScrollEnabled(false);
	}

	#restoreHistoricalScrollIfIdle(): void {
		if (
			this.#pendingHistoricalData !== undefined ||
			this.#historicalScrollEnabled === undefined
		) {
			return;
		}
		const scrollEnabled = this.#historicalScrollEnabled;
		this.#historicalScrollEnabled = undefined;
		this.#chart.setScrollEnabled(
			this.#chartInteractionSnapshot === undefined
				? scrollEnabled
				: false,
		);
	}

	#settlePendingHistoricalData(hasMore: boolean): void {
		const pending = this.#pendingHistoricalData;
		if (pending === undefined) {
			return;
		}
		this.#pendingHistoricalData = undefined;
		try {
			pending.callback([], { forward: hasMore, backward: false });
		} finally {
			this.#restoreHistoricalScrollIfIdle();
		}
	}

	#restoreWorkspaceDrawings(drawings: readonly EngineDrawingSnapshot[]): void {
		for (const overlay of this.#workspaceOverlays) {
			this.#chart.removeOverlay({ id: overlay.id });
		}
		this.#workspaceOverlays = [];
		this.#workspaceSources = new Map();
		for (const snapshot of drawings) {
			const drawing = drawingFromSnapshot(snapshot);
			this.#workspaceSources.set(drawing.id, drawing);
			const overlay = drawingToSceneOverlay(
				drawing,
				this.#paneIdFor(drawing.target.paneRole),
			);
			const result = this.#chart.createOverlay(
				toEngineOverlay(
					overlay,
					this.#idMap,
					`/drawings/${this.#workspaceOverlays.length}`,
					this.#overlayCallbacks(overlay),
				),
			);
			if (result !== overlay.id) {
				throw new SceneError(
					'RUNTIME_INIT_FAILED',
					`/drawings/${this.#workspaceOverlays.length}`,
					`KLineCharts failed to restore Drawing ${overlay.id}.`,
				);
			}
			this.#workspaceOverlays.push(structuredClone(overlay));
		}
	}

	#fromPixelToData(
		point: EnginePixelCoordinate,
		paneId: string,
	): EnginePointProjection {
		const filter = this.#primaryAxisFilter(paneId);
		const converted = this.#chart.convertFromPixel(
			[point],
			filter,
		) as Array<Partial<import('klinecharts').Point>>;
		const value = converted[0];
		return {
			...(value?.timestamp !== undefined ? { timestamp: value.timestamp } : {}),
			...(value?.value !== undefined ? { value: value.value } : {}),
		};
	}

	#engineOverlays(): Overlay[] {
		return this.#chart.getOverlays();
	}

	#emit(event: AdapterSceneEvent): void {
		for (const listener of this.#listeners) {
			listener(structuredClone(event));
		}
	}

	#selectOverlay(id: string | null): void {
		const previousId = this.#selectedOverlayId;
		if (previousId === id) {
			return;
		}
		if (previousId === null && id !== null) {
			this.#enterExclusiveSelection();
		} else if (previousId !== null && id === null) {
			this.#leaveExclusiveSelection();
		}
		this.#selectedOverlayId = id;
		if (this.#workspaceMode) {
			this.#emitPort({
				type: id === null ? 'deselected' : 'selected',
				id: id ?? previousId ?? '',
			});
			return;
		}
		this.#emit({ type: 'overlay-selection-changed', previousId, id });
		if (id !== null) {
			this.#emit({ type: 'overlay-selected', id });
		}
	}

	#enterExclusiveSelection(): void {
		if (
			this.#drawingInteraction.exclusiveSelection !== true ||
			this.#chartInteractionSnapshot !== undefined
		) {
			return;
		}
		this.#chartInteractionSnapshot = {
			scrollEnabled:
				this.#historicalScrollEnabled ?? this.#chart.isScrollEnabled(),
			zoomEnabled: this.#chart.isZoomEnabled(),
			crosshairVisible: this.#chart.getStyles().crosshair.show,
		};
		this.#chart.setScrollEnabled(false);
		this.#chart.setZoomEnabled(false);
		this.#chart.setStyles({ crosshair: { show: false } });
	}

	#leaveExclusiveSelection(): void {
		const snapshot = this.#chartInteractionSnapshot;
		if (snapshot === undefined) {
			return;
		}
		this.#chartInteractionSnapshot = undefined;
		this.#chart.setScrollEnabled(
			this.#historicalScrollEnabled === undefined
				? snapshot.scrollEnabled
				: false,
		);
		this.#chart.setZoomEnabled(snapshot.zoomEnabled);
		this.#chart.setStyles({ crosshair: { show: snapshot.crosshairVisible } });
	}

	#hitTolerance(pointerType: string): OverlayHitTolerance {
		const touch = pointerType === 'touch';
		const defaults = touch
			? DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE
			: DEFAULT_OVERLAY_MOUSE_HIT_TOLERANCE;
		const configured = touch
			? this.#drawingInteraction.hitTolerance?.touch
			: this.#drawingInteraction.hitTolerance?.mouse;
		const body = configured?.body ?? defaults.body;
		const anchor = configured?.anchor ?? defaults.anchor;
		if (!Number.isFinite(body) || body < 0 || !Number.isFinite(anchor) || anchor < 0) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				'/drawingInteraction/hitTolerance',
				'Drawing hit tolerance must contain finite non-negative CSS pixel values.',
			);
		}
		return { body, anchor };
	}

	#dimensionsForHit(
		overlay: SceneOverlay,
		hit: { readonly target: 'anchor' | 'body' },
	): InteractionDimensions {
		const constrainedType = overlay.type === 'horizontalStraightLine'
			|| overlay.type === 'priceLine'
			|| overlay.type === 'simpleTag'
			|| overlay.type === 'horizontalRayLine'
			|| overlay.type === 'horizontalSegment'
				? 'vertical'
				: overlay.type === 'verticalStraightLine'
					|| overlay.type === 'verticalRayLine'
					|| overlay.type === 'verticalSegment'
					? 'horizontal'
					: null;
		if (constrainedType === 'vertical') {
			return { horizontal: false, vertical: true };
		}
		if (constrainedType === 'horizontal') {
			return { horizontal: true, vertical: false };
		}
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
		const active = this.#activeOverlays();
		const existingIndex = active.findIndex((overlay) => overlay.id === source.id);
		const path = existingIndex < 0 ? `/overlays/${active.length}` : `/overlays/${existingIndex}`;
		const currentSource = existingIndex < 0 ? source : active[existingIndex]!;
		const overlay = fromEngineOverlay(
			engineOverlay,
			currentSource,
			this.#idMap,
			path,
			this.#scene.symbol.pricePrecision,
		);
		const overlays = structuredClone(active);
		if (existingIndex < 0) {
			overlays.push(overlay);
		} else {
			overlays[existingIndex] = overlay;
		}
		this.#setActiveOverlays(overlays);
		if (this.#workspaceMode) {
			const drawing = this.#workspaceSources.get(overlay.id);
			if (drawing !== undefined) {
				this.#emitPort({
					type: kind === 'created' ? 'created' : 'updated',
					id: overlay.id,
					drawing: snapshotOfDrawing(
						sceneOverlayToDrawing(overlay, drawing),
					),
					editDimensions: structuredClone(this.#interactionDimensions),
				});
			}
			return;
		}
		this.#emit({
			type: kind === 'created' ? 'overlay-created' : 'overlay-updated',
			overlay,
		});
	}

	#overlayCallbacks(
		source: OverlayDrawingSource | SceneOverlay,
		drawing = false,
	): EngineOverlayCallbacks {
		return {
			onRightClick: ({ preventDefault }) => {
				// KLineCharts 默认把右键命中 Overlay 解释为删除。Baron 的删除只能
				// 由显式对象级操作触发，因此在引擎回调层阻止该默认行为。
				preventDefault?.();
			},
			onDrawEnd: ({ overlay }) => {
				this.#finishTouchPrecisionDrawing(overlay.id);
				if (
					drawing &&
					this.#interactivePriceMeasurement?.source.id === source.id
				) {
					this.#interactivePriceMeasurement = undefined;
				}
				if (drawing && this.#drawingInProgressId === source.id) {
					this.#drawingInProgressId = null;
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
				this.#finishTouchPrecisionDrawing(overlay.id);
				if (this.#interactivePriceMeasurement?.source.id === overlay.id) {
					this.#interactivePriceMeasurement = undefined;
				}
				if (this.#drawingInProgressId === overlay.id) {
					this.#drawingInProgressId = null;
				}
				if (this.#activeOverlays().some((candidate) => candidate.id === overlay.id)) {
					this.#setActiveOverlays(
						this.#activeOverlays().filter((candidate) => candidate.id !== overlay.id),
					);
					if (this.#selectedOverlayId === overlay.id) {
						this.#selectOverlay(null);
					}
					if (this.#workspaceMode) {
						this.#workspaceSources.delete(overlay.id);
						this.#emitPort({ type: 'removed', id: overlay.id });
						return;
					}
					this.#emit({ type: 'overlay-removed', id: overlay.id });
				}
			},
		};
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
				this.#emit({ type: 'scene-error', issues: structuredClone(error.issues) });
				return;
			}
			throw error;
		}
	}

	#prepareTouchPrecisionDrawing(id: string, paneId: string): void {
		if (this.#drawingInteraction.touch !== 'precision-cursor') {
			return;
		}
		this.#finishTouchPrecisionDrawing();
		this.#touchPrecisionDrawing = {
			id,
			paneId,
			phase: 'move-start',
		};
		const view = this.#container.ownerDocument.defaultView;
		if (
			(view?.navigator.maxTouchPoints ?? 0) > 0 ||
			view?.matchMedia('(any-pointer: coarse)').matches === true
		) {
			const guide = this.#ensureTouchPrecisionGuide();
			guide.setPhase('move-start');
			guide.show();
		}
	}

	#ensureTouchPrecisionGuide(): TouchPrecisionDrawingGuide {
		this.#touchPrecisionGuide ??= new TouchPrecisionDrawingGuide(
			this.#container,
			() => this.#cancelTouchPrecisionDrawing(true),
		);
		return this.#touchPrecisionGuide;
	}

	#finishTouchPrecisionDrawing(id?: string): void {
		const drawing = this.#touchPrecisionDrawing;
		if (drawing === undefined || (id !== undefined && drawing.id !== id)) {
			return;
		}
		this.#stopTouchPrecisionPointerCapture();
		this.#touchPrecisionPointer = undefined;
		this.#touchPrecisionDrawing = undefined;
		this.#touchPrecisionGuide?.hide();
	}

	#cancelTouchPrecisionDrawing(emitRemoval: boolean): void {
		const drawing = this.#touchPrecisionDrawing;
		if (drawing === undefined) {
			return;
		}
		const id = drawing.id;
		this.#finishTouchPrecisionDrawing(id);
		this.#suppressCompatibilityMouseUntil = performance.now() + 800;
		this.#chart.removeOverlay({ id });
		if (this.#drawingInProgressId === id) {
			this.#drawingInProgressId = null;
		}
		if (this.#workspaceMode) {
			const removed = this.#workspaceSources.delete(id);
			if (emitRemoval && removed) {
				this.#emitPort({ type: 'removed', id });
			}
		}
	}

	#stopTouchPrecisionPointerCapture(): void {
		const pointer = this.#touchPrecisionPointer;
		if (pointer === undefined) {
			return;
		}
		try {
			if (this.#container.hasPointerCapture(pointer.pointerId)) {
				this.#container.releasePointerCapture(pointer.pointerId);
			}
		} catch {
			// Synthetic browser tests and interrupted system gestures may not own capture.
		}
	}

	#touchPrecisionMainElement(paneId: string): HTMLElement {
		const filter = this.#primaryAxisFilter(paneId);
		const main = this.#chart.getDom(filter.paneId, 'main');
		if (!(main instanceof HTMLElement)) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/drawings/target',
				'Touch Drawing target Pane has no interactive main element.',
			);
		}
		return main;
	}

	#touchPrecisionBounds(paneId: string): {
		readonly left: number;
		readonly top: number;
		readonly right: number;
		readonly bottom: number;
	} {
		const containerRect = this.#container.getBoundingClientRect();
		const mainRect = this.#touchPrecisionMainElement(paneId).getBoundingClientRect();
		return {
			left: Math.max(0, mainRect.left - containerRect.left),
			top: Math.max(0, mainRect.top - containerRect.top),
			right: Math.min(containerRect.width, mainRect.right - containerRect.left),
			bottom: Math.min(containerRect.height, mainRect.bottom - containerRect.top),
		};
	}

	#dispatchTouchPrecisionMouseMove(point: TouchPrecisionPoint): void {
		const rect = this.#container.getBoundingClientRect();
		this.#dispatchEngineMouseMove({
			x: point.x,
			y: point.y,
			pageX: rect.left + point.x + window.scrollX,
			pageY: rect.top + point.y + window.scrollY,
		});
	}

	#dispatchTouchPrecisionClick(point: TouchPrecisionPoint): void {
		const rect = this.#container.getBoundingClientRect();
		this.#resetClickArbitration();
		this.#dispatchEngineMouseClick({
			x: point.x,
			y: point.y,
			pageX: rect.left + point.x + window.scrollX,
			pageY: rect.top + point.y + window.scrollY,
		});
	}

	#updateTouchPrecisionCursor(
		drawing: TouchPrecisionDrawingState,
		pointer: TouchPrecisionPoint,
	): TouchPrecisionPoint {
		const cursor = resolveTouchPrecisionCursor(
			pointer,
			this.#touchPrecisionBounds(drawing.paneId),
		);
		this.#touchPrecisionGuide?.updateCursor(cursor);
		this.#dispatchTouchPrecisionMouseMove(cursor);
		return cursor;
	}

	#isTouchPrecisionCancelTarget(target: EventTarget | null): boolean {
		return this.#touchPrecisionGuide?.ownsCancelTarget(target) ?? false;
	}

	#installInteractionListeners(): void {
		this.#container.addEventListener('mousedown', this.#handleRightMouseDown, true);
		this.#container.addEventListener('click', this.#handleCompatibilityClick, true);
		this.#container.addEventListener('contextmenu', this.#handleContextMenu, true);
		this.#container.addEventListener('pointerdown', this.#handlePointerDown, true);
		this.#container.addEventListener('pointermove', this.#handlePointerMove, true);
		this.#container.addEventListener('pointerup', this.#handlePointerUp, true);
		this.#container.addEventListener('pointercancel', this.#handlePointerCancel, true);
		this.#container.addEventListener('touchstart', this.#handleCompatibilityTouch, {
			capture: true,
			passive: false,
		});
		this.#container.addEventListener('touchmove', this.#handleCompatibilityTouch, {
			capture: true,
			passive: false,
		});
		this.#container.addEventListener('touchend', this.#handleCompatibilityTouch, {
			capture: true,
			passive: false,
		});
		this.#container.addEventListener('touchcancel', this.#handleCompatibilityTouch, {
			capture: true,
			passive: false,
		});
		window.addEventListener('keydown', this.#handleKeyDown);
		window.addEventListener('blur', this.#handleWindowBlur);
	}

	#removeInteractionListeners(): void {
		this.#container.removeEventListener('mousedown', this.#handleRightMouseDown, true);
		this.#container.removeEventListener('click', this.#handleCompatibilityClick, true);
		this.#container.removeEventListener('contextmenu', this.#handleContextMenu, true);
		this.#container.removeEventListener('pointerdown', this.#handlePointerDown, true);
		this.#container.removeEventListener('pointermove', this.#handlePointerMove, true);
		this.#container.removeEventListener('pointerup', this.#handlePointerUp, true);
		this.#container.removeEventListener('pointercancel', this.#handlePointerCancel, true);
		this.#container.removeEventListener('touchstart', this.#handleCompatibilityTouch, true);
		this.#container.removeEventListener('touchmove', this.#handleCompatibilityTouch, true);
		this.#container.removeEventListener('touchend', this.#handleCompatibilityTouch, true);
		this.#container.removeEventListener('touchcancel', this.#handleCompatibilityTouch, true);
		window.removeEventListener('keydown', this.#handleKeyDown);
		window.removeEventListener('blur', this.#handleWindowBlur);
	}

	readonly #handleRightMouseDown = (event: MouseEvent): void => {
		if (
			event.button === 0 &&
			event.isTrusted &&
			performance.now() < this.#suppressCompatibilityMouseUntil &&
			!this.#isTouchPrecisionCancelTarget(event.target)
		) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		if (event.button === 2) {
			// 阻止事件到达 KLineCharts；不 preventDefault，保留浏览器原生右键菜单。
			event.stopPropagation();
		}
	};

	readonly #handleCompatibilityClick = (event: MouseEvent): void => {
		if (
			event.isTrusted &&
			performance.now() < this.#suppressCompatibilityMouseUntil &&
			!this.#isTouchPrecisionCancelTarget(event.target)
		) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};

	readonly #handleCompatibilityTouch = (event: TouchEvent): void => {
		if (
			(this.#touchPrecisionDrawing !== undefined ||
				performance.now() < this.#suppressCompatibilityMouseUntil) &&
			!this.#isTouchPrecisionCancelTarget(event.target)
		) {
			if (event.cancelable) {
				event.preventDefault();
			}
			event.stopImmediatePropagation();
		}
	};

	readonly #handleContextMenu = (event: MouseEvent): void => {
		// KLineCharts 会 preventDefault。捕获阶段截断传播，但 Baron 本身不拦截菜单。
		event.stopPropagation();
	};

	#pointerCoordinate(event: PointerEvent): PixelCoordinate {
		const rect = this.#container.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	#primaryAxisFilter(paneId: string): { paneId: string; yAxisId: string; absolute: true } {
		const pane = this.#scene.panes.find((candidate) => candidate.id === paneId);
		const axis = pane?.yAxes.find((candidate) => candidate.role === 'primary');
		const enginePaneId = this.#idMap.paneToEngine.get(paneId);
		const engineAxisId = axis === undefined ? undefined : this.#idMap.yAxisToEngine.get(axis.id);
		if (enginePaneId === undefined || engineAxisId === undefined) {
			throw new SceneError('INVALID_REFERENCE', '/panes', 'Overlay Pane or primary Y-axis is unmapped.');
		}
		return { paneId: enginePaneId, yAxisId: engineAxisId, absolute: true };
	}

	#toPixel(point: Partial<Point>, paneId: string): PixelCoordinate {
		const converted = this.#chart.convertToPixel(point, this.#primaryAxisFilter(paneId)) as Partial<Coordinate>;
		if (!Number.isFinite(converted.x) || !Number.isFinite(converted.y)) {
			throw new SceneError('EXPORT_INVALID', '/overlays', 'KLineCharts returned a non-finite pixel coordinate.');
		}
		return { x: converted.x!, y: converted.y! };
	}

	#fromPixel(point: PixelCoordinate, paneId: string): DragDataPoint {
		const converted = this.#chart.convertFromPixel(
			[point],
			this.#primaryAxisFilter(paneId),
		) as Array<Partial<Point>>;
		const value = converted[0];
		if (!Number.isFinite(value?.dataIndex) || !Number.isFinite(value?.value)) {
			throw new SceneError('INVALID_REFERENCE', '/overlays', 'Pointer does not map to finite chart data.');
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
			this.#primaryAxisFilter(paneId),
		) as Array<Partial<Point>>;
		const value = converted[0];
		if (
			!Number.isSafeInteger(value?.timestamp) ||
			!Number.isFinite(value?.value) ||
			!this.#scene.data.some((bar) => bar.timestamp === value?.timestamp)
		) {
			throw new SceneError(
				'INVALID_REFERENCE',
				path,
				'Pointer does not map to a finite price and an embedded market-data timestamp.',
			);
		}
		return {
			timestamp: value!.timestamp!,
			value: normalizePriceValue(
				value!.value!,
				this.#scene.symbol.pricePrecision,
				`${path}/value`,
			),
		};
	}

	#completeInteractivePriceMeasurement(
		drawing: InteractivePriceMeasurement,
		end: NonNullable<SceneOverlay['end']>,
	): void {
		const { text: _text, ...source } = drawing.source;
		const candidate = parseChartScene({
			...structuredClone(this.#scene),
			overlays: [
				...structuredClone(this.#scene.overlays),
				{
					...structuredClone(source),
					start: structuredClone(drawing.start),
					end: structuredClone(end),
				},
			],
		});
		const index = candidate.overlays.length - 1;
		const overlay = candidate.overlays[index]!;
		this.#interactivePriceMeasurement = undefined;
		this.#drawingInProgressId = null;
		if (!this.#chart.removeOverlay({ id: overlay.id })) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/overlays/${index}`,
				`KLineCharts failed to replace in-progress Overlay ${overlay.id}.`,
			);
		}
		const result = this.#chart.createOverlay(
			toEngineOverlay(
				overlay,
				this.#idMap,
				`/overlays/${index}`,
				this.#overlayCallbacks(overlay),
			),
		);
		if (result !== overlay.id) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/overlays/${index}`,
				`KLineCharts failed to commit interactive Overlay ${overlay.id}.`,
			);
		}
		this.#scene = candidate;
		this.#emit({ type: 'overlay-created', overlay });
	}

	#overlayGeometries(): readonly OverlayPixelGeometry[] {
		const geometries: OverlayPixelGeometry[] = [];
		const active = this.#activeOverlays();
		const containerRect = this.#container.getBoundingClientRect();
		const canvas = this.#container.ownerDocument.createElement('canvas');
		const textContext = canvas.getContext('2d');
		for (let sceneIndex = 0; sceneIndex < active.length; sceneIndex++) {
			const overlay = active[sceneIndex];
			if (overlay === undefined || !overlay.visible) {
				continue;
			}
			const paneFilter = this.#primaryAxisFilter(overlay.paneId);
			const paneMain = this.#chart.getDom(paneFilter.paneId, 'main');
			const mainRect = paneMain?.getBoundingClientRect() ?? containerRect;
			const geometry = projectOverlayGeometry(overlay, sceneIndex, {
				bounds: {
					left: mainRect.left - containerRect.left,
					top: mainRect.top - containerRect.top,
					right: mainRect.right - containerRect.left,
					bottom: mainRect.bottom - containerRect.top,
				},
				referenceTimestamp: this.#scene.data[0]!.timestamp,
				referenceValue: this.#scene.data[0]!.close,
				project: (point) => this.#toPixel(point, overlay.paneId),
				measureText: (text, source) => {
					const textStyle = source.styles.text;
					if (textContext !== null) {
						textContext.font = `${textStyle.weight} ${textStyle.size}px ${textStyle.family}`;
					}
					return {
						width: Math.max(
							textStyle.size,
							textContext?.measureText(text).width ?? [...text].length * textStyle.size,
						),
						height: textStyle.size * 1.4,
					};
				},
			});
			if (geometry !== null) {
				geometries.push(geometry);
			}
		}
		return geometries;
	}

	#interactionIdentity(interaction: PointerInteraction): AdapterDragEventIdentity {
		return {
			interactionId: interaction.interactionId,
			overlayId: interaction.hit.overlayId,
			target: interaction.hit.target,
			anchorIndex: interaction.hit.anchorIndex,
			before: structuredClone(interaction.before),
		};
	}

	#stopPointerCapture(interaction: PointerInteraction): void {
		if (this.#container.hasPointerCapture(interaction.pointerId)) {
			this.#container.releasePointerCapture(interaction.pointerId);
		}
	}

	#cancelInteraction(reason: AdapterDragCancelReason, error?: SceneError): void {
		const interaction = this.#pointerInteraction;
		if (interaction === undefined) {
			return;
		}
		this.#pointerInteraction = undefined;
		this.#interactionDimensions = { horizontal: false, vertical: false };
		this.#stopPointerCapture(interaction);
		if (!interaction.started) {
			return;
		}
		const index = this.#activeOverlays().findIndex((overlay) => overlay.id === interaction.before.id);
		if (
			index < 0 ||
			!this.#chart.overrideOverlay(
				toEngineOverlay(
					interaction.before,
					this.#idMap,
					`/overlays/${index}`,
					this.#overlayCallbacks(interaction.before),
				),
			)
		) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				'/overlays',
				`KLineCharts failed to restore Overlay ${interaction.before.id}.`,
			);
		}
		this.#emit({
			type: 'overlay-drag-cancelled',
			...this.#interactionIdentity(interaction),
			reason,
		});
		if (reason === 'validation-error' && error !== undefined) {
			this.#emit({ type: 'scene-error', issues: structuredClone(error.issues) });
		}
	}

	#routeTouchPrecisionPointerDown(event: PointerEvent): boolean {
		const drawing = this.#touchPrecisionDrawing;
		if (drawing === undefined || this.#isTouchPrecisionCancelTarget(event.target)) {
			return false;
		}
		if (event.pointerType !== 'touch') {
			this.#finishTouchPrecisionDrawing(drawing.id);
			return false;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		if (this.#touchPrecisionPointer !== undefined) {
			return true;
		}
		const guide = this.#ensureTouchPrecisionGuide();
		guide.setPhase(drawing.phase);
		guide.show();
		const point = this.#pointerCoordinate(event);
		this.#touchPrecisionPointer = {
			pointerId: event.pointerId,
			origin: point,
			current: point,
		};
		try {
			this.#container.setPointerCapture(event.pointerId);
		} catch {
			// Synthetic PointerEvents do not own browser pointer capture.
		}
		this.#suppressCompatibilityMouseUntil = performance.now() + 800;
		this.#updateTouchPrecisionCursor(drawing, point);
		return true;
	}

	#routeTouchPrecisionPointerMove(event: PointerEvent): boolean {
		const drawing = this.#touchPrecisionDrawing;
		const pointer = this.#touchPrecisionPointer;
		if (
			drawing === undefined ||
			pointer === undefined ||
			pointer.pointerId !== event.pointerId
		) {
			return false;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		const point = this.#pointerCoordinate(event);
		pointer.current = point;
		this.#suppressCompatibilityMouseUntil = performance.now() + 800;
		this.#updateTouchPrecisionCursor(drawing, point);
		return true;
	}

	#routeTouchPrecisionPointerUp(event: PointerEvent): boolean {
		const drawing = this.#touchPrecisionDrawing;
		const pointer = this.#touchPrecisionPointer;
		if (
			drawing === undefined ||
			pointer === undefined ||
			pointer.pointerId !== event.pointerId
		) {
			return false;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		const point = this.#pointerCoordinate(event);
		pointer.current = point;
		const cursor = this.#updateTouchPrecisionCursor(drawing, point);
		const tap = isTouchPrecisionTap(pointer.origin, pointer.current);
		this.#stopTouchPrecisionPointerCapture();
		this.#touchPrecisionPointer = undefined;
		this.#suppressCompatibilityMouseUntil = performance.now() + 800;
		if (drawing.phase === 'move-start') {
			drawing.phase = 'confirm-start';
			this.#touchPrecisionGuide?.setPhase('confirm-start');
			return true;
		}
		if (!tap) {
			return true;
		}
		const phase = drawing.phase;
		this.#dispatchTouchPrecisionClick(cursor);
		const active = this.#touchPrecisionDrawing;
		if (
			phase === 'confirm-start' &&
			active !== undefined &&
			active.id === drawing.id
		) {
			active.phase = 'confirm-end';
			this.#touchPrecisionGuide?.setPhase('confirm-end');
		}
		return true;
	}

	readonly #handlePointerDown = (event: PointerEvent): void => {
		if (
			this.#disposed ||
			event.button !== 0 ||
			this.#pointerInteraction !== undefined ||
			this.#deselectingPointerId !== undefined ||
			!this.#mutationsEnabled
		) {
			return;
		}
		if (this.#routeTouchPrecisionPointerDown(event)) {
			return;
		}
		const coordinate = this.#pointerCoordinate(event);
		const measurement = this.#interactivePriceMeasurement;
		if (measurement !== undefined) {
			try {
				const point = this.#measurementAnchor(
					coordinate,
					measurement.source.paneId,
					measurement.start === undefined ? '/overlays/start' : '/overlays/end',
				);
				if (measurement.start === undefined) {
					measurement.start = point;
					return;
				}
				// 保留该次点击的兼容 mousedown/mouseup，让引擎自然闭合并复位点击仲裁状态。
				event.stopImmediatePropagation();
				this.#completeInteractivePriceMeasurement(measurement, point);
				return;
			} catch (error) {
				if (error instanceof SceneError) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.#emit({ type: 'scene-error', issues: structuredClone(error.issues) });
					return;
				}
				throw error;
			}
		}
		// 绘制进行中时 pointerdown 必须优先路由给新绘制：不得对已有 overlay 做命中测试、
		// 选中、取消选中或拖拽，也不得 preventDefault / stopImmediatePropagation /
		// setPointerCapture，否则引擎收不到 mousedown/click，新绘制首击会被消费。
		if (this.#drawingInProgressId !== null) {
			return;
		}
		const hit = hitTestOverlayGeometries(
			coordinate,
			this.#overlayGeometries(),
			this.#hitTolerance(event.pointerType),
		);
		if (hit === null) {
			const selected = this.#activeOverlays().find(
				(overlay) => overlay.id === this.#selectedOverlayId,
			);
			if (
				selected !== undefined &&
				this.#drawingInteraction.exclusiveSelection === true
			) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.#deselectingPointerId = event.pointerId;
				try {
					this.#container.setPointerCapture(event.pointerId);
				} catch {
					// Synthetic PointerEvents do not own browser pointer capture.
				}
				return;
			}
			if (selected !== undefined && isControlledInteractionOverlay(selected)) {
				this.#selectOverlay(null);
			}
			return;
		}
		const before = this.#activeOverlays().find((overlay) => overlay.id === hit.overlayId);
		if (before === undefined) {
			return;
		}
		this.#selectOverlay(before.id);
		if (
			!isControlledInteractionOverlay(before) &&
			this.#drawingInteraction.exclusiveSelection !== true
		) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		if (hit.locked) {
			return;
		}
		try {
			this.#container.setPointerCapture(event.pointerId);
		} catch {
			// Synthetic PointerEvents do not own browser pointer capture.
		}
		this.#interactionDimensions = this.#dimensionsForHit(before, hit);
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
		if (this.#routeTouchPrecisionPointerMove(event)) {
			return;
		}
		if (this.#deselectingPointerId === event.pointerId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		const interaction = this.#pointerInteraction;
		if (interaction === undefined || interaction.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		const coordinate = this.#pointerCoordinate(event);
		if (
			!interaction.started &&
			Math.hypot(
				coordinate.x - interaction.originClient.x,
				coordinate.y - interaction.originClient.y,
			) < 0.5
		) {
			return;
		}
		if (!interaction.started) {
			interaction.started = true;
			this.#emit({
				type: 'overlay-drag-started',
				...this.#interactionIdentity(interaction),
			});
		}
		try {
			const candidate = createDragCandidate(
				interaction.before,
				interaction.hit,
				interaction.originData,
				this.#fromPixel(coordinate, interaction.before.paneId),
				this.#scene.data.map((bar) => bar.timestamp),
				this.#scene.symbol.pricePrecision,
			);
			const active = this.#activeOverlays();
			const index = active.findIndex((overlay) => overlay.id === candidate.id);
			const overlays = structuredClone(active);
			overlays[index] = candidate;
			const normalized = this.#workspaceMode
				? candidate
				: parseChartScene({ ...structuredClone(this.#scene), overlays }).overlays[index]!;
			if (!this.#chart.overrideOverlay(toEngineOverlay(
				normalized,
				this.#idMap,
				`/overlays/${index}`,
				this.#overlayCallbacks(normalized),
			))) {
				throw new SceneError(
					'RUNTIME_INIT_FAILED',
					`/overlays/${index}`,
					`KLineCharts failed to preview Overlay ${normalized.id}.`,
				);
			}
			if (this.#workspaceMode) {
				interaction.candidate = candidate;
				this.#setActiveOverlays(overlays);
				return;
			}
			interaction.candidate = normalized;
			this.#emit({
				type: 'overlay-dragging',
				...this.#interactionIdentity(interaction),
				candidate: normalized,
			});
		} catch (error) {
			if (error instanceof SceneError) {
				this.#cancelInteraction('validation-error', error);
				return;
			}
			throw error;
		}
	};

	readonly #handlePointerUp = (event: PointerEvent): void => {
		if (this.#routeTouchPrecisionPointerUp(event)) {
			return;
		}
		if (this.#deselectingPointerId === event.pointerId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			if (this.#container.hasPointerCapture(event.pointerId)) {
				this.#container.releasePointerCapture(event.pointerId);
			}
			this.#deselectingPointerId = undefined;
			this.#selectOverlay(null);
			return;
		}
		const interaction = this.#pointerInteraction;
		if (interaction === undefined || interaction.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.#pointerInteraction = undefined;
		const interactionDimensions = this.#interactionDimensions;
		this.#interactionDimensions = { horizontal: false, vertical: false };
		this.#stopPointerCapture(interaction);
		if (!interaction.started) {
			return;
		}
		const overlay = interaction.candidate ?? interaction.before;
		const active = this.#activeOverlays();
		const index = active.findIndex((candidate) => candidate.id === overlay.id);
		const overlays = structuredClone(active);
		overlays[index] = overlay;
		if (this.#workspaceMode) {
			this.#setActiveOverlays(overlays);
			const drawing = this.#workspaceSources.get(overlay.id);
			if (drawing !== undefined) {
				this.#emitPort({
					type: 'updated',
					id: overlay.id,
					drawing: snapshotOfDrawing(
						sceneOverlayToDrawing(overlay, drawing),
					),
					editDimensions: structuredClone(interactionDimensions),
				});
			}
			return;
		}
		this.#scene = parseChartScene({ ...structuredClone(this.#scene), overlays });
		const committed = this.#scene.overlays[index]!;
		this.#emit({
			type: 'overlay-drag-committed',
			...this.#interactionIdentity(interaction),
			overlay: committed,
		});
		this.#emit({ type: 'overlay-updated', overlay: committed });
	};

	readonly #handlePointerCancel = (event: PointerEvent): void => {
		if (this.#touchPrecisionPointer?.pointerId === event.pointerId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#cancelTouchPrecisionDrawing(true);
			return;
		}
		if (this.#pointerInteraction?.pointerId === event.pointerId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#cancelInteraction('pointer-cancel');
			return;
		}
		if (this.#deselectingPointerId === event.pointerId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			if (this.#container.hasPointerCapture(event.pointerId)) {
				this.#container.releasePointerCapture(event.pointerId);
			}
			this.#deselectingPointerId = undefined;
			this.#selectOverlay(null);
		}
	};

	readonly #handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape' && this.#touchPrecisionDrawing !== undefined) {
			this.#cancelTouchPrecisionDrawing(true);
			return;
		}
		if (event.key === 'Escape' && this.#pointerInteraction !== undefined) {
			this.#cancelInteraction('escape');
		}
		if (
			event.key === 'Escape' &&
			this.#drawingInteraction.exclusiveSelection === true &&
			this.#selectedOverlayId !== null
		) {
			this.#selectOverlay(null);
		}
	};

	readonly #handleWindowBlur = (): void => {
		if (this.#touchPrecisionDrawing !== undefined) {
			this.#cancelTouchPrecisionDrawing(true);
		}
		if (this.#pointerInteraction !== undefined) {
			this.#cancelInteraction('window-blur');
		}
		if (this.#deselectingPointerId !== undefined) {
			if (this.#container.hasPointerCapture(this.#deselectingPointerId)) {
				this.#container.releasePointerCapture(this.#deselectingPointerId);
			}
			this.#deselectingPointerId = undefined;
			this.#selectOverlay(null);
		}
	};

	public subscribe(listener: AdapterSceneEventListener): () => void {
		this.#assertActive();
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	public exportScene(): ChartScene {
		this.#assertActive();
		for (let index = 0; index < this.#scene.overlays.length; index++) {
			const overlay = this.#scene.overlays[index]!;
			if (!this.#engineOverlays().some((engine) => engine.id === overlay.id)) {
				throw new SceneError(
					'EXPORT_INVALID',
					`/overlays/${index}`,
					`KLineCharts lost Overlay ${overlay.id}.`,
				);
			}
		}
		return parseChartScene(structuredClone(this.#scene));
	}

	public async setPriceScale(scale: PriceScale): Promise<ChartScene> {
		this.#assertActive();
		const candidate = parseChartScene(promoteSceneToM2(this.#scene, scale));
		const paneIndex = candidate.panes.findIndex((pane) => pane.kind === 'candle');
		const pane = candidate.panes[paneIndex]!;
		const axisIndex = pane.yAxes.findIndex((axis) => axis.role === 'primary');
		const axis = pane.yAxes[axisIndex]!;
		const previousPane = this.#scene.panes[paneIndex]!;
		const previousAxis = previousPane.yAxes[axisIndex]!;
		const path = `/panes/${paneIndex}/yAxes/${axisIndex}`;
		try {
			overrideSceneYAxis(this.#chart, this.#idMap, axis, pane.id, path);
			// KLineCharts batches Y-axis recreation in a microtask; await that formal
			// layout boundary before making the upgraded Scene externally visible.
			await Promise.resolve();
			const reference = candidate.data[0]!;
			this.#toPixel(
				{ timestamp: reference.timestamp, value: reference.close },
				pane.id,
			);
		} catch (error) {
			overrideSceneYAxis(
				this.#chart,
				this.#idMap,
				previousAxis,
				previousPane.id,
				path,
			);
			await Promise.resolve();
			if (error instanceof SceneError) {
				throw error;
			}
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`${path}/scale`,
				'KLineCharts failed to apply the requested price scale atomically.',
			);
		}
		this.#scene = candidate;
		return structuredClone(candidate);
	}

	/** 同结构场景替换：symbol/period/data/viewport 原子更新，失败恢复旧场景。 */
	public replaceScene(value: ChartScene): ChartScene {
		this.#assertActive();
		const candidate = parseChartScene(value);
		if (candidate.version !== this.#scene.version) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/version',
				'Scene replacement requires the same ChartScene contract version.',
			);
		}
		assertGapAwareSceneSupported(candidate);
		const paneShape = (scene: ChartScene): string =>
			JSON.stringify(
				scene.panes.map((pane) => ({
					id: pane.id,
					kind: pane.kind,
					order: pane.order,
				})),
			);
		if (paneShape(candidate) !== paneShape(this.#scene)) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/panes',
				'Scene replacement requires an identical Pane structure.',
			);
		}
		const previous = this.#scene;
		const previousBackground = this.#container.style.backgroundColor;
		const previousHistoricalHasMore = this.#historicalDataLoading?.hasMore;
		this.#settlePendingHistoricalData(false);
		try {
			this.#chart.setSymbol({
				ticker: candidate.symbol.ticker,
				pricePrecision: candidate.symbol.pricePrecision,
				volumePrecision: candidate.symbol.volumePrecision,
				...(candidate.symbol.name === undefined ? {} : { name: candidate.symbol.name }),
			});
			this.#chart.setPeriod(structuredClone(candidate.period));
			if (this.#historicalDataLoading !== undefined) {
				this.#historicalDataLoading = { hasMore: true };
			}
			this.#chart.setDataLoader(
				this.#historicalDataLoading === undefined
					? createStaticDataLoader(engineDataForScene(candidate))
					: this.#historicalDataLoader(candidate),
			);
			this.#chart.resetData();
			applyViewport(this.#chart, candidate.viewport);
			this.#scene = candidate;
			this.#container.style.backgroundColor =
				candidate.chart.layout.backgroundColor;
			return structuredClone(candidate);
		} catch (error) {
			try {
				this.#chart.setSymbol({
					ticker: previous.symbol.ticker,
					pricePrecision: previous.symbol.pricePrecision,
					volumePrecision: previous.symbol.volumePrecision,
					...(previous.symbol.name === undefined ? {} : { name: previous.symbol.name }),
				});
				this.#chart.setPeriod(structuredClone(previous.period));
				if (
					this.#historicalDataLoading !== undefined &&
					previousHistoricalHasMore !== undefined
				) {
					this.#historicalDataLoading = { hasMore: previousHistoricalHasMore };
				}
				this.#chart.setDataLoader(
					this.#historicalDataLoading === undefined
						? createStaticDataLoader(engineDataForScene(previous))
						: this.#historicalDataLoader(previous),
				);
				this.#chart.resetData();
				applyViewport(this.#chart, previous.viewport);
				this.#container.style.backgroundColor = previousBackground;
			} catch {
				// 回滚失败：保留原错误，Adapter 状态由调用方决定是否终止。
			}
			throw error;
		}
	}

	public configureHistoricalDataLoading(hasMore: boolean): void {
		this.#assertActive();
		if (!this.#workspaceMode) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/',
				'Historical data loading requires the Workspace factory.',
			);
		}
		this.#settlePendingHistoricalData(hasMore);
		this.#historicalDataLoading = { hasMore };
		this.#chart.setDataLoader(this.#historicalDataLoader(this.#scene));
		this.#chart.resetData();
		applyViewport(this.#chart, this.#scene.viewport);
	}

	public subscribeHistoricalDataRequests(
		listener: (request: EngineHistoricalDataRequest) => void,
	): () => void {
		this.#assertActive();
		this.#historicalDataListeners.add(listener);
		if (this.#pendingHistoricalData !== undefined) {
			listener(structuredClone(this.#pendingHistoricalData.request));
		}
		return () => {
			this.#historicalDataListeners.delete(listener);
		};
	}

	public commitHistoricalData(
		requestId: string,
		data: readonly MarketData[],
		hasMore: boolean,
	): EngineHistoricalDataCommitResult {
		this.#assertActive();
		const pending = this.#pendingHistoricalData;
		if (pending === undefined || pending.request.requestId !== requestId) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/requestId',
				`Historical data request is not pending: ${requestId}.`,
			);
		}
		if (data.length === 0 && hasMore) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/data',
				'An empty historical page cannot advertise more data.',
			);
		}
		const page = structuredClone(data) as MarketData[];
		const earliestTimestamp = this.#scene.data[0]!.timestamp;
		for (let index = 0; index < page.length; index += 1) {
			const current = page[index]!;
			const previous = page[index - 1];
			if (
				current.timestamp >= earliestTimestamp ||
				(previous !== undefined && current.timestamp <= previous.timestamp)
			) {
				throw new SceneError(
					'INVALID_REFERENCE',
					`/data/${index}/timestamp`,
					'Historical data must be strictly ascending and earlier than the current first bar.',
				);
			}
		}
		const candidate = parseChartScene({
			...structuredClone(this.#scene),
			data: [...page, ...structuredClone(this.#scene.data)],
		});
		this.#pendingHistoricalData = undefined;
		this.#historicalDataLoading = { hasMore };
		this.#scene = candidate;
		try {
			pending.callback(structuredClone(page) as unknown as import('klinecharts').KLineData[], {
				forward: hasMore,
				backward: false,
			});
		} finally {
			this.#restoreHistoricalScrollIfIdle();
		}
		return {
			scene: structuredClone(candidate),
			addedCount: page.length,
			hasMore,
		};
	}

	public rejectHistoricalData(requestId: string): boolean {
		this.#assertActive();
		const pending = this.#pendingHistoricalData;
		if (pending === undefined || pending.request.requestId !== requestId) {
			return false;
		}
		this.#pendingHistoricalData = undefined;
		try {
			pending.callback([], {
				forward: this.#historicalDataLoading?.hasMore ?? false,
				backward: false,
			});
		} finally {
			this.#restoreHistoricalScrollIfIdle();
		}
		return true;
	}

	public get sceneKind(): 'chart' | 'time-series' {
		return 'chart';
	}

	public restoreDrawings(
		drawings: readonly EngineDrawingSnapshot[],
	): void {
		this.#assertActive();
		this.#assertNotTerminated();
		if (!this.#workspaceMode) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/',
				'Drawing port operations require the Workspace factory.',
			);
		}
		this.#restoreWorkspaceDrawings(drawings);
	}

	public startDrawing(request: EngineDrawingStartRequest): string {
		this.#assertActive();
		this.#assertNotTerminated();
		const drawing = placeholderDrawing(request);
		if (this.#workspaceSources.has(request.id)) {
			throw new SceneError(
				'DUPLICATE_ID',
				`/drawings/${request.id}`,
				`Drawing ${request.id} already exists.`,
			);
		}
		this.#workspaceSources.set(request.id, drawing);
		const overlay = drawingToSceneOverlay(
			drawing,
			this.#paneIdFor(request.target.paneRole),
		);
		const result = this.#chart.createOverlay(
			toEngineOverlayDrawing(
				{
					...structuredClone(request),
					...structuredClone(overlay),
				},
				this.#idMap,
				this.#overlayCallbacks(overlay, true),
			),
		);
		if (result !== request.id) {
			this.#workspaceSources.delete(request.id);
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				'/drawings',
				`KLineCharts failed to start Drawing ${request.id}.`,
			);
		}
		this.#drawingInProgressId = request.id;
		if (request.type === 'segment') {
			this.#prepareTouchPrecisionDrawing(request.id, overlay.paneId);
		}
		return request.id;
	}

	public listDrawings(): readonly EngineDrawingSnapshot[] {
		this.#assertActive();
		return Array.from(
			this.#workspaceSources.values(),
			(drawing) => snapshotOfDrawing(drawing),
		);
	}

	public getDrawing(id: string): EngineDrawingSnapshot | undefined {
		this.#assertActive();
		const drawing = this.#workspaceSources.get(id);
		return drawing === undefined ? undefined : snapshotOfDrawing(drawing);
	}

	public updateDrawingStyles(
		id: string,
		styles: Drawing['styles'],
	): EngineDrawingSnapshot {
		this.#assertActive();
		this.#assertNotTerminated();
		const source = this.#workspaceSources.get(id);
		const overlay = this.#workspaceOverlays.find((candidate) => candidate.id === id);
		if (source === undefined || overlay === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				`/drawings/${id}`,
				`Drawing ${id} does not exist.`,
			);
		}
		if (!this.#chart.overrideOverlay({
			id,
			styles: toOverlayStyles(styles),
		})) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/drawings/${id}/styles`,
				`KLineCharts failed to update Drawing ${id} styles.`,
			);
		}
		const updated: Drawing = {
			...structuredClone(source),
			styles: structuredClone(styles),
		};
		this.#workspaceSources.set(id, updated);
		this.#workspaceOverlays = this.#workspaceOverlays.map((candidate) =>
			candidate.id === id
				? drawingToSceneOverlay(updated, candidate.paneId)
				: candidate,
		);
		this.#emitPort({
			type: 'updated',
			id,
			drawing: snapshotOfDrawing(updated),
			editDimensions: { horizontal: false, vertical: false },
		});
		return snapshotOfDrawing(updated);
	}

	public updateDrawingText(id: string, text: string): EngineDrawingSnapshot {
		this.#assertActive();
		this.#assertNotTerminated();
		const source = this.#workspaceSources.get(id);
		const overlay = this.#workspaceOverlays.find((candidate) => candidate.id === id);
		if (source === undefined || overlay === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				`/drawings/${id}`,
				`Drawing ${id} does not exist.`,
			);
		}
		if (!this.#chart.overrideOverlay({ id, extendData: text })) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/drawings/${id}/text`,
				`KLineCharts failed to update Drawing ${id} text.`,
			);
		}
		const updated = withDrawingText(structuredClone(source), text);
		this.#workspaceSources.set(id, updated);
		this.#workspaceOverlays = this.#workspaceOverlays.map((candidate) =>
			candidate.id === id
				? drawingToSceneOverlay(updated, candidate.paneId)
				: candidate,
		);
		this.#emitPort({
			type: 'updated',
			id,
			drawing: snapshotOfDrawing(updated),
			editDimensions: { horizontal: false, vertical: false },
		});
		return snapshotOfDrawing(updated);
	}

	public updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot {
		this.#assertActive();
		this.#assertNotTerminated();
		const source = this.#workspaceSources.get(id);
		if (source === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				`/drawings/${id}`,
				`Drawing ${id} does not exist.`,
			);
		}
		if (!this.#chart.overrideOverlay({ id, lock: locked })) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/drawings/${id}/locked`,
				`KLineCharts failed to update Drawing ${id} lock state.`,
			);
		}
		const updated = {
			...structuredClone(source),
			locked,
		} as unknown as Drawing;
		this.#workspaceSources.set(id, updated);
		this.#workspaceOverlays = this.#workspaceOverlays.map((candidate) =>
			candidate.id === id
				? drawingToSceneOverlay(updated, candidate.paneId)
				: candidate,
		);
		const snapshot = snapshotOfDrawing(updated);
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
		this.#assertNotTerminated();
		return this.#chart.removeOverlay({ id });
	}

	public restoreDrawing(snapshot: EngineDrawingSnapshot): void {
		this.#assertActive();
		this.#assertNotTerminated();
		const drawing = drawingFromSnapshot(snapshot);
		const existing = this.#workspaceOverlays.find(
			(overlay) => overlay.id === drawing.id,
		);
		const overlay = drawingToSceneOverlay(
			drawing,
			this.#paneIdFor(drawing.target.paneRole),
		);
		if (existing !== undefined) {
			if (!this.#chart.overrideOverlay(
				toEngineOverlay(
					overlay,
					this.#idMap,
					`/drawings/${drawing.id}`,
					this.#overlayCallbacks(overlay),
				),
			)) {
				throw new SceneError(
					'RUNTIME_INIT_FAILED',
					`/drawings/${drawing.id}`,
					`KLineCharts failed to restore Drawing ${drawing.id}.`,
				);
			}
			return;
		}
		const result = this.#chart.createOverlay(
			toEngineOverlay(
				overlay,
				this.#idMap,
				`/drawings/${drawing.id}`,
				this.#overlayCallbacks(overlay),
			),
		);
		if (result !== drawing.id) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/drawings/${drawing.id}`,
				`KLineCharts failed to restore Drawing ${drawing.id}.`,
			);
		}
	}

	public selectDrawing(id: string | null): void {
		this.#assertActive();
		this.#selectOverlay(id);
	}

	public hitTestDrawing(point: EnginePixelCoordinate): string | null {
		this.#assertActive();
		return this.hitTestOverlay(point)?.overlayId ?? null;
	}

	public projectToPixel(
		anchor: { readonly timestamp?: number; readonly value?: number },
		paneRole: string,
	): EnginePointProjection {
		this.#assertActive();
		const paneId = this.#paneIdFor(paneRole);
		return this.#toPixel(anchor, paneId) as EnginePointProjection;
	}

	public unprojectFromPixel(
		point: EnginePixelCoordinate,
		paneRole: string,
	): EnginePointProjection {
		this.#assertActive();
		return this.#fromPixelToData(point, this.#paneIdFor(paneRole));
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

	public applyMainSeriesPresentation(
		presentation: MainSeriesPresentation,
	): MainSeriesPresentationResult {
		this.#assertActive();
		this.#assertNotTerminated();
		if (isGapAwareScene(this.#scene)) {
			throw new MainSeriesPresentationError(
				'MAIN_SERIES_PRESENTATION_UNSUPPORTED',
				'/chart/candle/type',
				'ChartScene v2 main-series switching is disabled until every presentation is Gap-aware.',
			);
		}
		if (presentation.type === 'area') {
			const expected = STANDARD_CLOSE_LINE_PRESENTATION;
			if (
				presentation.value !== expected.value ||
				presentation.line.color !== expected.line.color ||
				presentation.line.size !== expected.line.size ||
				presentation.backgroundColor !== expected.backgroundColor ||
				presentation.smooth !== expected.smooth ||
				presentation.pointVisible !== expected.pointVisible
			) {
				throw new MainSeriesPresentationError(
					'MAIN_SERIES_PRESENTATION_INVALID',
					'/chart/candle/area',
					'Area presentation must use the standard frozen close-line configuration.',
				);
			}
		}
		const candidate = parseChartScene(
			presentationToSceneCandle(this.#scene, presentation),
		);
		const oldStyles = structuredClone(this.#chart.getStyles());
		const overlayBefore = this.#chart.getOverlays().map((overlay) => ({
			id: overlay.id,
			currentStep: overlay.currentStep,
			points: structuredClone(overlay.points),
		}));
		const selectionBefore = this.#selectedOverlayId;
		const targetType = presentation.type as ActiveMainSeriesType;
		const newStyles: import('klinecharts').DeepPartial<import('klinecharts').Styles> =
			presentation.type === 'area'
				? {
						candle: {
							type: 'area',
							area: {
								lineColor: presentation.line.color,
								lineSize: presentation.line.size,
								value: presentation.value,
								backgroundColor: presentation.backgroundColor,
								smooth: presentation.smooth,
								point: { show: false, animation: false },
							},
						},
					}
				: {
						candle: {
							type: presentation.type,
						},
					};
		try {
			this.#chart.setStyles(newStyles);
		} catch (error) {
			this.#rollbackPresentation(oldStyles, overlayBefore, selectionBefore);
		}
		if (
			!this.#verifyPresentation(targetType) ||
			!this.#verifyOverlaySnapshot(overlayBefore, selectionBefore)
		) {
			this.#rollbackPresentation(oldStyles, overlayBefore, selectionBefore);
		}
		this.#scene = candidate;
		return { activeType: targetType };
	}

	#verifyPresentation(type: ActiveMainSeriesType): boolean {
		const styles = this.#chart.getStyles();
		if (styles.candle.type !== type) {
			return false;
		}
		if (type !== 'area') {
			return true;
		}
		const area = styles.candle.area;
		return area.value === 'close'
			&& area.lineColor === 'rgba(41, 98, 255, 1)'
			&& area.lineSize === 2
			&& area.backgroundColor === 'rgba(0, 0, 0, 0)'
			&& area.smooth === false
			&& area.point.show === false;
	}

	#verifyOverlaySnapshot(
		before: ReadonlyArray<{
			readonly id: string;
			readonly currentStep: number;
			readonly points: readonly unknown[];
		}>,
		selection: string | null,
	): boolean {
		const after = this.#chart.getOverlays();
		if (after.length !== before.length) {
			return false;
		}
		for (let index = 0; index < after.length; index++) {
			const left = after[index]!;
			const right = before[index]!;
			if (
				left.id !== right.id ||
				left.currentStep !== right.currentStep ||
				JSON.stringify(left.points) !== JSON.stringify(right.points)
			) {
				return false;
			}
		}
		return this.#selectedOverlayId === selection;
	}

	#rollbackPresentation(
		oldStyles: import('klinecharts').Styles,
		overlayBefore: ReadonlyArray<{
			readonly id: string;
			readonly currentStep: number;
			readonly points: readonly unknown[];
		}>,
		selection: string | null,
	): never {
		let rollbackOk = false;
		try {
			this.#chart.setStyles(oldStyles);
			rollbackOk =
				JSON.stringify(this.#chart.getStyles()) === JSON.stringify(oldStyles) &&
				this.#verifyOverlaySnapshot(overlayBefore, selection);
		} catch {
			rollbackOk = false;
		}
		if (rollbackOk) {
			throw new MainSeriesPresentationError(
				'MAIN_SERIES_PRESENTATION_APPLY_FAILED',
				'/chart/candle',
				'KLineCharts failed to apply the main series presentation; the previous styles were restored.',
			);
		}
		this.#terminated = true;
		throw new MainSeriesPresentationError(
			'MAIN_SERIES_PRESENTATION_ROLLBACK_FAILED',
			'/chart/candle',
			'KLineCharts failed to roll back the main series presentation; the Adapter is destroy-only.',
		);
	}

	public projectPoint(
		point: { readonly timestamp: number; readonly value: number },
		paneId?: string,
	): PixelCoordinate {
		this.#assertActive();
		const targetPane = paneId ?? this.#scene.panes.find((pane) => pane.kind === 'candle')!.id;
		return this.#toPixel(point, targetPane);
	}

	public hitTestOverlay(point: PixelCoordinate): OverlayHitResult | null {
		this.#assertActive();
		return hitTestOverlayGeometries(point, this.#overlayGeometries());
	}

	public addOverlay(value: SceneOverlay): SceneOverlay {
		this.#assertActive();
		const baseScene = value.type === 'priceMeasurement'
			? promoteSceneToM2(this.#scene)
			: structuredClone(this.#scene);
		const candidate = parseChartScene({
			...baseScene,
			overlays: [...baseScene.overlays, structuredClone(value)],
		});
		const index = candidate.overlays.length - 1;
		const overlay = candidate.overlays[index]!;
		const result = this.#chart.createOverlay(
			toEngineOverlay(
				overlay,
				this.#idMap,
				`/overlays/${index}`,
				this.#overlayCallbacks(overlay),
			),
		);
		if (result !== overlay.id) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/overlays/${index}`,
				`KLineCharts failed to create Overlay ${overlay.id}.`,
			);
		}
		this.#scene = candidate;
		this.#emit({ type: 'overlay-created', overlay });
		return structuredClone(overlay);
	}

	#updateOverlay(value: SceneOverlay, styleChange: boolean): SceneOverlay {
		this.#assertActive();
		const index = this.#scene.overlays.findIndex((overlay) => overlay.id === value.id);
		if (index < 0) {
			throw new SceneError('INVALID_REFERENCE', '/overlays', `Overlay ${value.id} does not exist.`);
		}
		const before = structuredClone(this.#scene.overlays[index]!);
		const overlays = structuredClone(this.#scene.overlays);
		overlays[index] = structuredClone(value);
		const candidate = parseChartScene({
			...structuredClone(this.#scene),
			overlays,
		});
		const overlay = candidate.overlays[index]!;
		const normalized = normalizeSceneOverlayPrices(
			overlay,
			this.#idMap,
			`/overlays/${index}`,
			this.#scene.symbol.pricePrecision,
		);
		if (!this.#chart.overrideOverlay(toEngineOverlay(
			normalized,
			this.#idMap,
			`/overlays/${index}`,
			this.#overlayCallbacks(normalized),
		))) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/overlays/${index}`,
				`KLineCharts failed to update Overlay ${overlay.id}.`,
			);
		}
		const nextOverlays = structuredClone(candidate.overlays);
		nextOverlays[index] = normalized;
		this.#scene = parseChartScene({
			...candidate,
			overlays: nextOverlays,
		});
		if (styleChange) {
			this.#emit({ type: 'overlay-style-changed', before, overlay: normalized });
		}
		this.#emit({ type: 'overlay-updated', overlay: normalized });
		return structuredClone(normalized);
	}

	public updateOverlay(value: SceneOverlay): SceneOverlay {
		return this.#updateOverlay(value, false);
	}

	public updateOverlayStyles(
		id: string,
		styles: SceneOverlay['styles'],
	): SceneOverlay {
		const overlay = this.getOverlay(id);
		if (overlay === undefined) {
			throw new SceneError('INVALID_REFERENCE', '/overlays', `Overlay ${id} does not exist.`);
		}
		return this.#updateOverlay({ ...overlay, styles: structuredClone(styles) }, true);
	}

	public removeOverlay(id: string): boolean {
		this.#assertActive();
		const index = this.#scene.overlays.findIndex((overlay) => overlay.id === id);
		if (index < 0) {
			return false;
		}
		if (!this.#chart.removeOverlay({ id })) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/overlays/${index}`,
				`KLineCharts failed to remove Overlay ${id}.`,
			);
		}
		if (this.#scene.overlays.some((overlay) => overlay.id === id)) {
			this.#scene = parseChartScene({
				...structuredClone(this.#scene),
				overlays: this.#scene.overlays.filter((overlay) => overlay.id !== id),
			});
			if (this.#selectedOverlayId === id) {
				this.#selectOverlay(null);
			}
			this.#emit({ type: 'overlay-removed', id });
		}
		return true;
	}

	public startOverlayDrawing(request: OverlayDrawingRequest): string {
		this.#assertActive();
		if (
			this.#scene.overlays.some((overlay) => overlay.id === request.id) ||
			this.#engineOverlays().some((overlay) => overlay.id === request.id)
		) {
			throw new SceneError('DUPLICATE_ID', '/overlays/id', `Overlay ${request.id} already exists.`);
		}
		// 下一次绘制开始前显式复位引擎点击仲裁：klinecharts 10.0.0 会在 500ms 窗口内
		// 相距 ≥5px 的第二次 mouseup 上既不派发 click 也不派发 double-click，直接丢弃该次点击，
		// 导致“上一绘制提交后紧接着的新绘制首击”被吞。复位后新绘制首击总是独立的单击。
		this.#resetClickArbitration();
		const candidate = request.type === 'priceMeasurement'
			? parseChartScene(promoteSceneToM2(this.#scene))
			: this.#scene;
		const result = this.#chart.createOverlay(
			toEngineOverlayDrawing(
				structuredClone(request),
				this.#idMap,
				this.#overlayCallbacks(structuredClone(request), true),
			),
		);
		if (result !== request.id) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				'/overlays',
				`KLineCharts failed to start drawing Overlay ${request.id}.`,
			);
		}
		this.#drawingInProgressId = request.id;
		this.#scene = candidate;
		if (request.type === 'priceMeasurement') {
			this.#interactivePriceMeasurement = {
				source: {
					...structuredClone(request),
					type: 'priceMeasurement',
				},
			};
		}
		return request.id;
	}

	public getOverlay(id: string): SceneOverlay | undefined {
		this.#assertActive();
		const overlay = this.#scene.overlays.find((candidate) => candidate.id === id);
		return overlay === undefined ? undefined : structuredClone(overlay);
	}

	public listOverlays(): readonly SceneOverlay[] {
		this.#assertActive();
		return structuredClone(this.#scene.overlays);
	}

	public getContainer(): HTMLElement {
		this.#assertActive();
		return this.#container;
	}

	public listIndicators(): readonly SceneIndicator[] {
		this.#assertActive();
		return structuredClone(this.#scene.panes.flatMap((pane) => pane.indicators));
	}

	public addIndicator(value: SceneIndicator): SceneIndicator {
		this.#assertActive();
		const paneIndex = this.#scene.panes.findIndex(
			(pane) => pane.id === value.paneId,
		);
		if (paneIndex < 0) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/panes',
				`Pane ${value.paneId} does not exist.`,
			);
		}
		const pane = this.#scene.panes[paneIndex]!;
		if (pane.indicators.some((indicator) => indicator.id === value.id)) {
			throw new SceneError(
				'DUPLICATE_ID',
				`/panes/${paneIndex}/indicators`,
				`Indicator ${value.id} already exists.`,
			);
		}
		const path = `/panes/${pane.order}/indicators/${pane.indicators.length}`;
		const createdId = this.#chart.createIndicator(
			toIndicatorCreate(value, this.#idMap, path),
			true,
		);
		if (createdId === null || createdId !== value.id) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				path,
				`KLineCharts failed to create Indicator ${value.id}.`,
			);
		}
		const panes = structuredClone(this.#scene.panes);
		panes[paneIndex]!.indicators.push(structuredClone(value));
		this.#scene = parseChartScene({
			...structuredClone(this.#scene),
			panes,
		});
		const committed = this.#scene.panes[paneIndex]!.indicators.at(-1)!;
		this.#emit({ type: 'indicator-created', indicator: committed });
		return structuredClone(committed);
	}

	public removeIndicator(id: string): boolean {
		this.#assertActive();
		const paneIndex = this.#scene.panes.findIndex((pane) =>
			pane.indicators.some((indicator) => indicator.id === id),
		);
		if (paneIndex < 0) {
			return false;
		}
		if (!this.#chart.removeIndicator({ id })) {
			return false;
		}
		const panes = structuredClone(this.#scene.panes);
		const targetPane = panes[paneIndex]!;
		targetPane.indicators = targetPane.indicators.filter(
			(indicator) => indicator.id !== id,
		);
		this.#scene = parseChartScene({
			...structuredClone(this.#scene),
			panes,
		});
		this.#emit({ type: 'indicator-removed', id });
		return true;
	}

	public subscribeCrosshair(
		listener: AdapterCrosshairListener,
	): () => void {
		this.#assertActive();
		this.#crosshairListeners.add(listener);
		return () => {
			this.#crosshairListeners.delete(listener);
		};
	}

	public inspect(): AdapterSnapshot {
		this.#assertActive();
		const indicators = this.#chart.getIndicators()
			.filter((indicator) => indicator.id !== GAP_AWARE_CANDLE_INDICATOR_ID)
			.map((indicator) => {
			const paneId = this.#idMap.paneFromEngine.get(indicator.paneId);
			const yAxisId = this.#idMap.yAxisFromEngine.get(indicator.yAxisId);
			if (paneId === undefined || yAxisId === undefined) {
				throw new SceneError(
					'EXPORT_INVALID',
					'/panes',
					'KLineCharts returned an Indicator with unmapped internal IDs.',
				);
			}
			return {
				id: indicator.id,
				name: indicator.name as SceneIndicator['name'],
				paneId,
				yAxisId,
			};
			});
		return {
			engineVersion: this.#engine.version(),
			runtimeVersion: this.#scene.runtime.runtimeVersion,
			dataCount: this.#scene.data.length,
			timelineSlotCount: timelineSlotCount(this.#scene),
			gapCount: gapCount(this.#scene),
			paneIds: this.#scene.panes.map((pane) => pane.id),
			indicators,
			overlays: this.exportScene().overlays,
			barSpace: this.#chart.getBarSpace().bar,
			rightOffsetDistance: this.#chart.getOffsetRightDistance(),
		};
	}

	public dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#cancelInteraction('destroy');
		this.#deselectingPointerId = undefined;
		this.#leaveExclusiveSelection();
		this.#cancelTouchPrecisionDrawing(false);
		this.#touchPrecisionGuide?.destroy();
		this.#touchPrecisionGuide = undefined;
		this.#interactivePriceMeasurement = undefined;
		this.#drawingInProgressId = null;
		this.#disposed = true;
		this.#removeInteractionListeners();
		this.#unsubscribeCrosshair?.();
		this.#unsubscribeCrosshair = null;
		this.#crosshairListeners.clear();
		this.#listeners.clear();
		this.#portListeners.clear();
		this.#historicalDataListeners.clear();
		this.#settlePendingHistoricalData(false);
		this.#workspaceSources.clear();
		this.#workspaceOverlays = [];
		this.#engine.dispose(this.#container);
		this.#container.replaceChildren();
		this.#container.style.backgroundColor = this.#originalBackground;
	}
}

function snapshotOfDrawing(drawing: Drawing): EngineDrawingSnapshot {
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

function drawingFromSnapshot(
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

function placeholderGeometry(type: Drawing['type']): Drawing['geometry'] {
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

function placeholderDrawing(
	request: EngineDrawingStartRequest,
): Drawing {
	return {
		id: request.id,
		type: request.type,
		...(request.groupId === undefined ? {} : { groupId: request.groupId }),
		target: structuredClone(request.target),
		geometry: placeholderGeometry(request.type),
		styles: structuredClone(request.styles),
		metadata: structuredClone(request.metadata ?? {}),
		visible: true,
		locked: false,
		zLevel: 0,
		mode: 'normal',
	} as unknown as Drawing;
}

function withDrawingText(drawing: Drawing, text: string): Drawing {
	switch (drawing.type) {
		case 'simpleTag':
			return {
				...structuredClone(drawing),
				geometry: { ...drawing.geometry, text },
			} as unknown as Drawing;
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
