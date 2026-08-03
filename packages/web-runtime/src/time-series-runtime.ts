import type {
	TimeSeriesPoint,
	TimeSeriesScene,
	TimeSeriesSceneIssue,
} from '@baron1996/kline-scene-schema';
import {
	parseTimeSeriesScene,
	TimeSeriesSceneError,
} from '@baron1996/kline-scene-schema';
import {
	TimeSeriesChartsAdapter,
	type TimeSeriesAdapterCrosshair,
} from '@baron1996/klinecharts-adapter';

import { TIME_SERIES_RUNTIME_STYLES } from './time-series-runtime-styles.js';
import type {
	TimeSeriesRuntimeEvent,
	TimeSeriesRuntimeEventPayload,
	TimeSeriesRuntimeListener,
	TimeSeriesRuntimeOptions,
	TimeSeriesRuntime as TimeSeriesRuntimeContract,
} from './time-series-types.js';

function runtimeError(): TimeSeriesSceneError {
	return new TimeSeriesSceneError(
		'TIME_SERIES_RUNTIME_DESTROYED',
		'/runtime',
		'The Time Series Runtime has been destroyed.',
	);
}

function adapterError(error: unknown): TimeSeriesSceneError {
	if (error instanceof TimeSeriesSceneError) {
		return error;
	}
	return new TimeSeriesSceneError(
		'TIME_SERIES_ADAPTER_FAILED',
		'/runtime/adapter',
		'The Time Series Adapter operation failed.',
	);
}

function exportError(error: unknown): TimeSeriesSceneError {
	const issues: readonly TimeSeriesSceneIssue[] = error instanceof TimeSeriesSceneError
		? error.issues.map((issue) => ({
			...issue,
			code: 'TIME_SERIES_EXPORT_INVALID' as const,
		}))
		: [{
			code: 'TIME_SERIES_EXPORT_INVALID',
			path: '/',
			message: 'Time Series Scene export validation failed.',
		}];
	return new TimeSeriesSceneError(
		'TIME_SERIES_EXPORT_INVALID',
		'/',
		'Time Series Scene export validation failed.',
		issues,
	);
}

function createSwatch(color: string): HTMLSpanElement {
	const swatch = document.createElement('span');
	swatch.className = 'baron-time-series-runtime__swatch';
	swatch.setAttribute('aria-hidden', 'true');
	swatch.style.setProperty('--baron-time-series-color', color);
	return swatch;
}

function notifyRuntimeListener(
	listener: TimeSeriesRuntimeListener,
	event: TimeSeriesRuntimeEvent,
): void {
	try {
		listener(structuredClone(event));
	} catch {
		// 宿主回调异常不得改变 Runtime 已完成的状态变更或错误语义。
	}
}

/** 独立的通用时间序列 Runtime，不公开或复用旧 K 线 Runtime 状态。 */
class TimeSeriesRuntimeImplementation implements TimeSeriesRuntimeContract {
	/** 唯一受控的时间序列 Adapter。 */
	#adapter: TimeSeriesChartsAdapter | null;
	/** Runtime 纯数据事件监听器。 */
	readonly #listeners = new Set<TimeSeriesRuntimeListener>();
	/** 图例按钮，按 Scene 中 series 的声明顺序保存。 */
	readonly #legendButtons = new Map<string, HTMLButtonElement>();
	/** 图例按钮事件解绑函数。 */
	readonly #legendCleanups: Array<() => void> = [];
	/** Runtime 自有覆盖层根节点。 */
	#root: HTMLDivElement | null;
	/** Runtime 自有样式节点。 */
	#styleElement: HTMLStyleElement | null;
	/** 十字线 Tooltip 节点。 */
	#tooltip: HTMLDivElement | null;
	/** Adapter 十字线监听器解绑函数。 */
	#unsubscribeCrosshair: (() => void) | null;
	/** Adapter 容器。 */
	#container: HTMLElement | null;
	/** 创建前容器内联 position，销毁时精确恢复。 */
	#originalPosition: string | null;
	/** 当前完整且通过校验的 Scene。 */
	#scene: TimeSeriesScene | null;
	/** 防止销毁后继续访问 Adapter。 */
	#destroyed = false;

	private constructor(
		container: HTMLElement,
		scene: TimeSeriesScene,
		adapter: TimeSeriesChartsAdapter,
		options: TimeSeriesRuntimeOptions,
	) {
		this.#container = container;
		this.#scene = scene;
		this.#adapter = adapter;
		this.#originalPosition = container.style.position;
		if (getComputedStyle(container).position === 'static') {
			container.style.position = 'relative';
		}
		if (options.onEvent !== undefined) {
			this.#listeners.add(options.onEvent);
		}

		this.#styleElement = document.createElement('style');
		this.#styleElement.dataset.baronTimeSeriesStyle = 'true';
		this.#styleElement.textContent = TIME_SERIES_RUNTIME_STYLES;

		this.#root = document.createElement('div');
		this.#root.className = 'baron-time-series-runtime';
		this.#root.style.setProperty(
			'--baron-time-series-text',
			scene.chart.layout.textColor,
		);
		this.#root.style.setProperty(
			'--baron-time-series-background',
			scene.chart.layout.backgroundColor,
		);
		this.#root.style.setProperty(
			'--baron-time-series-font',
			scene.chart.layout.fontFamily,
		);

		const legend = document.createElement('div');
		legend.className = 'baron-time-series-runtime__legend';
		legend.setAttribute('aria-label', '时间序列图例');
		for (const series of scene.series) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'baron-time-series-runtime__legend-button';
			button.dataset.timeSeriesId = series.id;
			button.setAttribute('aria-pressed', String(series.visible));
			button.append(createSwatch(series.style.color), series.name);
			const handleClick = (): void => {
				this.setSeriesVisible(
					series.id,
					button.getAttribute('aria-pressed') !== 'true',
				);
			};
			button.addEventListener('click', handleClick);
			this.#legendCleanups.push(
				() => button.removeEventListener('click', handleClick),
			);
			this.#legendButtons.set(series.id, button);
			legend.append(button);
		}

		this.#tooltip = document.createElement('div');
		this.#tooltip.className = 'baron-time-series-runtime__tooltip';
		this.#tooltip.hidden = true;
		this.#tooltip.setAttribute('role', 'status');
		this.#root.append(legend, this.#tooltip);
		container.append(this.#styleElement, this.#root);
		this.#unsubscribeCrosshair = adapter.subscribeCrosshair(
			(event) => this.#handleCrosshair(event),
		);
	}

	public static async create(
		container: HTMLElement,
		value: unknown,
		options: TimeSeriesRuntimeOptions = {},
	): Promise<TimeSeriesRuntimeImplementation> {
		let adapter: TimeSeriesChartsAdapter | null = null;
		try {
			const scene = parseTimeSeriesScene(value);
			adapter = await TimeSeriesChartsAdapter.create(container, scene);
			const runtime = new TimeSeriesRuntimeImplementation(
				container,
				scene,
				adapter,
				options,
			);
			runtime.#emit({ type: 'scene-ready', scene: runtime.exportScene() });
			return runtime;
		} catch (error) {
			adapter?.dispose();
			const normalized = adapterError(error);
			if (options.onEvent !== undefined) {
				notifyRuntimeListener(options.onEvent, {
					type: 'scene-error',
					issues: structuredClone(normalized.issues),
					sceneVersion: 1,
					runtimeVersion: '0.1.0',
				});
			}
			throw normalized;
		}
	}

	#assertActive(): void {
		if (this.#destroyed) {
			throw runtimeError();
		}
	}

	#emit(payload: TimeSeriesRuntimeEventPayload): void {
		const event = {
			...structuredClone(payload),
			sceneVersion: 1,
			runtimeVersion: '0.1.0',
		} as TimeSeriesRuntimeEvent;
		for (const listener of this.#listeners) {
			notifyRuntimeListener(listener, event);
		}
	}

	#emitError(error: TimeSeriesSceneError): void {
		this.#emit({ type: 'scene-error', issues: structuredClone(error.issues) });
	}

	#handleCrosshair(event: TimeSeriesAdapterCrosshair): void {
		const tooltip = this.#tooltip;
		const scene = this.#scene;
		if (this.#destroyed || tooltip === null || scene === null) {
			return;
		}
		tooltip.replaceChildren();
		if (event.timestamp === null || event.values === null) {
			tooltip.hidden = true;
			this.#emit({
				type: 'crosshair-changed',
				timestamp: null,
				values: null,
			});
			return;
		}

		const time = document.createElement('div');
		time.className = 'baron-time-series-runtime__tooltip-time';
		time.textContent = new Intl.DateTimeFormat(scene.chart.locale, {
			timeZone: scene.chart.timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(new Date(event.timestamp));
		tooltip.append(time);

		for (const series of scene.series) {
			if (!series.visible) {
				continue;
			}
			const row = document.createElement('div');
			row.className = 'baron-time-series-runtime__tooltip-row';
			const name = document.createElement('span');
			name.className = 'baron-time-series-runtime__tooltip-name';
			name.append(createSwatch(series.style.color), series.name);
			const value = document.createElement('span');
			value.className = 'baron-time-series-runtime__tooltip-value';
			const raw = event.values[series.id];
			value.textContent = raw === null || raw === undefined
				? '—'
				: `${raw.toFixed(series.precision)} ${series.unit}`;
			row.append(name, value);
			tooltip.append(row);
		}
		tooltip.hidden = false;
		this.#emit({
			type: 'crosshair-changed',
			timestamp: event.timestamp,
			values: structuredClone(event.values),
		});
	}

	public setSeriesVisible(seriesId: string, visible: boolean): TimeSeriesScene {
		try {
			this.#assertActive();
			const adapter = this.#adapter;
			if (adapter === null) {
				throw runtimeError();
			}
			const scene = adapter.setSeriesVisible(seriesId, visible);
			this.#scene = scene;
			this.#legendButtons.get(seriesId)?.setAttribute(
				'aria-pressed',
				String(visible),
			);
			const result = structuredClone(scene);
			this.#emit({
				type: 'series-visibility-changed',
				seriesId,
				visible,
				scene: result,
			});
			return structuredClone(result);
		} catch (error) {
			const normalized = adapterError(error);
			this.#emitError(normalized);
			throw normalized;
		}
	}

	public async replaceData(
		data: readonly TimeSeriesPoint[],
	): Promise<TimeSeriesScene> {
		try {
			this.#assertActive();
			const adapter = this.#adapter;
			if (adapter === null) {
				throw runtimeError();
			}
			const scene = adapter.replaceData(structuredClone(data));
			this.#scene = scene;
			const result = structuredClone(scene);
			this.#emit({
				type: 'data-replaced',
				dataCount: result.data.length,
				scene: result,
			});
			return structuredClone(result);
		} catch (error) {
			const normalized = adapterError(error);
			this.#emitError(normalized);
			throw normalized;
		}
	}

	public exportScene(): TimeSeriesScene {
		this.#assertActive();
		try {
			const scene = this.#scene;
			if (scene === null) {
				throw runtimeError();
			}
			return parseTimeSeriesScene(structuredClone(scene));
		} catch (error) {
			const normalized = exportError(error);
			this.#emitError(normalized);
			throw normalized;
		}
	}

	public subscribe(listener: TimeSeriesRuntimeListener): () => void {
		this.#assertActive();
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	public destroy(): void {
		if (this.#destroyed) {
			return;
		}
		this.#destroyed = true;
		this.#unsubscribeCrosshair?.();
		for (const cleanup of this.#legendCleanups) {
			cleanup();
		}
		this.#legendCleanups.length = 0;
		this.#legendButtons.clear();
		this.#root?.remove();
		this.#styleElement?.remove();
		this.#adapter?.dispose();
		this.#listeners.clear();
		if (this.#container !== null && this.#originalPosition !== null) {
			this.#container.style.position = this.#originalPosition;
		}
		this.#unsubscribeCrosshair = null;
		this.#tooltip = null;
		this.#root = null;
		this.#styleElement = null;
		this.#adapter = null;
		this.#scene = null;
		this.#container = null;
		this.#originalPosition = null;
	}
}

export async function createTimeSeriesRuntime(
	container: HTMLElement,
	scene: unknown,
	options: TimeSeriesRuntimeOptions = {},
): Promise<TimeSeriesRuntimeContract> {
	return TimeSeriesRuntimeImplementation.create(container, scene, options);
}
