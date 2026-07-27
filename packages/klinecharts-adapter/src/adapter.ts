import type {
	ChartScene,
	SceneIndicator,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import {
	parseChartScene,
	SceneError,
} from '@baron1996/kline-scene-schema';
import type { Chart, Overlay } from 'klinecharts';

import { createEngine, type EngineHandle } from './engine.js';
import { registerProjectOverlays } from './extensions/register.js';
import {
	createEngineIdMap,
	type EngineIdMap,
} from './conversion/id-map.js';
import { applyPanes } from './conversion/panes.js';
import {
	createSceneOverlays,
	type EngineOverlayCallbacks,
	fromEngineOverlay,
	type OverlayDrawingSource,
	toEngineOverlay,
	toEngineOverlayDrawing,
} from './conversion/overlays.js';
import { applyViewport } from './conversion/viewport.js';

export interface AdapterIndicatorSnapshot {
	readonly id: string;
	readonly name: SceneIndicator['name'];
	readonly paneId: string;
	readonly yAxisId: string;
}

export interface AdapterSnapshot {
	readonly engineVersion: string;
	readonly dataCount: number;
	readonly paneIds: readonly string[];
	readonly indicators: readonly AdapterIndicatorSnapshot[];
	readonly overlays: readonly SceneOverlay[];
	readonly barSpace: number;
	readonly rightOffsetDistance: number;
}

export type AdapterSceneEvent =
	| { readonly type: 'overlay-created'; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-updated'; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-removed'; readonly id: string }
	| { readonly type: 'overlay-selected'; readonly id: string }
	| { readonly type: 'scene-error'; readonly issues: readonly SceneError['issues'][number][] };

export type AdapterSceneEventListener = (event: AdapterSceneEvent) => void;

export interface OverlayDrawingRequest extends OverlayDrawingSource {}

/**
 * ChartScene 与 KLineCharts 之间的唯一边界。
 * 引擎对象和内部 ID 永不从该类的公共接口泄露。
 */
export class KLineChartsSceneAdapter {
	/** KLineCharts 实例，仅在 Adapter 内部使用。 */
	readonly #chart: Chart;
	/** 引擎模块句柄，用于版本读取和精确销毁。 */
	readonly #engine: EngineHandle['module'];
	/** 场景 ID 与引擎内部 ID 的双向映射。 */
	readonly #idMap: EngineIdMap;
	/** 当前可导出的规范化场景。 */
	#scene: ChartScene;
	/** 当前引擎容器。 */
	readonly #container: HTMLElement;
	/** 创建前容器的内联背景，销毁后恢复。 */
	readonly #originalBackground: string;
	/** 防止重复调用 KLineCharts dispose。 */
	#disposed = false;
	/** 仅传递纯场景数据的事件订阅者。 */
	readonly #listeners = new Set<AdapterSceneEventListener>();

	private constructor(
		container: HTMLElement,
		scene: ChartScene,
		handle: EngineHandle,
		idMap: EngineIdMap,
		originalBackground: string,
	) {
		this.#container = container;
		this.#scene = scene;
		this.#chart = handle.chart;
		this.#engine = handle.module;
		this.#idMap = idMap;
		this.#originalBackground = originalBackground;
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

	#assertActive(): void {
		if (this.#disposed) {
			throw new SceneError('RUNTIME_INIT_FAILED', '/', 'The Adapter has already been disposed.');
		}
	}

	#engineOverlays(): Overlay[] {
		return this.#chart.getOverlays();
	}

	#emit(event: AdapterSceneEvent): void {
		for (const listener of this.#listeners) {
			listener(structuredClone(event));
		}
	}

	#commitEngineOverlay(
		engineOverlay: Overlay,
		source: OverlayDrawingSource | SceneOverlay,
		kind: 'created' | 'updated',
	): void {
		const existingIndex = this.#scene.overlays.findIndex((overlay) => overlay.id === source.id);
		const path = existingIndex < 0 ? `/overlays/${this.#scene.overlays.length}` : `/overlays/${existingIndex}`;
		const currentSource = existingIndex < 0 ? source : this.#scene.overlays[existingIndex]!;
		const overlay = fromEngineOverlay(engineOverlay, currentSource, this.#idMap, path);
		const overlays = structuredClone(this.#scene.overlays);
		if (existingIndex < 0) {
			overlays.push(overlay);
		} else {
			overlays[existingIndex] = overlay;
		}
		this.#scene = parseChartScene({
			...structuredClone(this.#scene),
			overlays,
		});
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
			onDrawEnd: ({ overlay }) => {
				this.#safelyCommitEngineOverlay(overlay, source, drawing ? 'created' : 'updated');
			},
			onPressedMoveEnd: ({ overlay }) => {
				this.#safelyCommitEngineOverlay(overlay, source, 'updated');
			},
			onSelected: ({ overlay }) => {
				this.#emit({ type: 'overlay-selected', id: overlay.id });
			},
			onRemoved: ({ overlay }) => {
				if (this.#scene.overlays.some((candidate) => candidate.id === overlay.id)) {
					this.#scene = parseChartScene({
						...structuredClone(this.#scene),
						overlays: this.#scene.overlays.filter((candidate) => candidate.id !== overlay.id),
					});
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

	public subscribe(listener: AdapterSceneEventListener): () => void {
		this.#assertActive();
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	public exportScene(): ChartScene {
		this.#assertActive();
		const engines = new Map(this.#engineOverlays().map((overlay) => [overlay.id, overlay]));
		const overlays = this.#scene.overlays.map((source, index) => {
			const engine = engines.get(source.id);
			if (engine === undefined) {
				throw new SceneError(
					'EXPORT_INVALID',
					`/overlays/${index}`,
					`KLineCharts lost Overlay ${source.id}.`,
				);
			}
			return fromEngineOverlay(engine, source, this.#idMap, `/overlays/${index}`);
		});
		return parseChartScene({
			...structuredClone(this.#scene),
			overlays,
		});
	}

	public addOverlay(value: SceneOverlay): SceneOverlay {
		this.#assertActive();
		const candidate = parseChartScene({
			...structuredClone(this.#scene),
			overlays: [...this.#scene.overlays, structuredClone(value)],
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

	public updateOverlay(value: SceneOverlay): SceneOverlay {
		this.#assertActive();
		const index = this.#scene.overlays.findIndex((overlay) => overlay.id === value.id);
		if (index < 0) {
			throw new SceneError('INVALID_REFERENCE', '/overlays', `Overlay ${value.id} does not exist.`);
		}
		const overlays = structuredClone(this.#scene.overlays);
		overlays[index] = structuredClone(value);
		const candidate = parseChartScene({
			...structuredClone(this.#scene),
			overlays,
		});
		const overlay = candidate.overlays[index]!;
		if (
			!this.#chart.overrideOverlay(
				toEngineOverlay(overlay, this.#idMap, `/overlays/${index}`),
			)
		) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/overlays/${index}`,
				`KLineCharts failed to update Overlay ${overlay.id}.`,
			);
		}
		this.#scene = candidate;
		this.#emit({ type: 'overlay-updated', overlay });
		return structuredClone(overlay);
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
		return request.id;
	}

	public getOverlay(id: string): SceneOverlay | undefined {
		return this.exportScene().overlays.find((overlay) => overlay.id === id);
	}

	public listOverlays(): readonly SceneOverlay[] {
		return this.exportScene().overlays;
	}

	public inspect(): AdapterSnapshot {
		this.#assertActive();
		const indicators = this.#chart.getIndicators().map((indicator) => {
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
			dataCount: this.#chart.getDataList().length,
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
		this.#disposed = true;
		this.#listeners.clear();
		this.#engine.dispose(this.#container);
		this.#container.replaceChildren();
		this.#container.style.backgroundColor = this.#originalBackground;
	}
}
