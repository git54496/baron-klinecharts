import type {
	TimeSeriesPoint,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';
import {
	parseTimeSeriesScene,
	TimeSeriesSceneError,
} from '@baron1996/kline-scene-schema';
import type {
	ActionCallback,
	Chart,
	KLineData,
} from 'klinecharts';

import { toKLineChartsTimeSeriesOptions } from '../conversion/chart-options.js';
import { applyViewport } from '../conversion/viewport.js';
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

interface KLineChartsModule {
	readonly dispose: (container: HTMLElement) => void;
	readonly init: typeof import('klinecharts').init;
	readonly registerIndicator: typeof import('klinecharts').registerIndicator;
	readonly version: typeof import('klinecharts').version;
}

interface TimeSeriesCarrierData extends KLineData {
	readonly __baronTimeSeriesValues: Readonly<Record<string, number | null>>;
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

/** TimeSeriesScene 与 KLineCharts 之间的唯一受控边界。 */
export class TimeSeriesChartsAdapter {
	/** KLineCharts 实例，只能在 Adapter 内使用。 */
	readonly #chart: Chart;
	/** 引擎模块，用于版本检查和精确销毁。 */
	readonly #engine: KLineChartsModule;
	/** 当前可导出的规范化 Scene。 */
	#scene: TimeSeriesScene;
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
	/** 防止重复销毁底层引擎。 */
	#disposed = false;

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
		this.#pointByTimestamp = new Map(
			scene.data.map((point) => [point.timestamp, point]),
		);
		this.#chart = chart;
		this.#engine = engine;
		this.#originalBackground = originalBackground;
		this.#interactiveRoot = interactiveRoot;
		this.#chart.subscribeAction('onCrosshairChange', this.#handleCrosshair);
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

	#assertActive(): void {
		if (this.#disposed) {
			throw adapterError('The Time Series Adapter has already been disposed.');
		}
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

	public exportScene(): TimeSeriesScene {
		this.#assertActive();
		return parseTimeSeriesScene(structuredClone(this.#scene));
	}

	public dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#chart.unsubscribeAction('onCrosshairChange', this.#handleCrosshair);
		this.#interactiveRoot.removeEventListener(
			'pointerleave',
			this.#handlePointerLeave,
		);
		this.#crosshairListeners.clear();
		this.#pointByTimestamp.clear();
		this.#engine.dispose(this.#container);
		this.#container.replaceChildren();
		this.#container.style.backgroundColor = this.#originalBackground;
	}
}
