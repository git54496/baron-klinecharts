import type {
	ChartScene,
	SceneIndicator,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import {
	parseChartScene,
	SceneError,
} from '@baron1996/kline-scene-schema';
import type { Chart, Coordinate, Overlay, Point } from 'klinecharts';

import { createEngine, type EngineHandle } from './engine.js';
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
	type OverlayDrawingSource,
	toEngineOverlay,
	toEngineOverlayDrawing,
} from './conversion/overlays.js';
import { applyViewport } from './conversion/viewport.js';
import {
	createDragCandidate,
	type DragDataPoint,
} from './interaction/dragging.js';
import {
	hitTestOverlayGeometries,
	type OverlayHitResult,
	type OverlayPixelGeometry,
	type PixelCoordinate,
} from './interaction/hit-testing.js';

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

export interface AdapterSnapshot {
	readonly engineVersion: string;
	readonly runtimeVersion: ChartScene['runtime']['runtimeVersion'];
	readonly dataCount: number;
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
	| { readonly type: 'overlay-updated'; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-style-changed'; readonly before: SceneOverlay; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-removed'; readonly id: string }
	| { readonly type: 'overlay-selection-changed'; readonly previousId: string | null; readonly id: string | null }
	| { readonly type: 'overlay-selected'; readonly id: string }
	| ({ readonly type: 'overlay-drag-started' } & AdapterDragEventIdentity)
	| ({ readonly type: 'overlay-dragging'; readonly candidate: SceneOverlay } & AdapterDragEventIdentity)
	| ({ readonly type: 'overlay-drag-committed'; readonly overlay: SceneOverlay } & AdapterDragEventIdentity)
	| ({ readonly type: 'overlay-drag-cancelled'; readonly reason: AdapterDragCancelReason } & AdapterDragEventIdentity)
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
export class KLineChartsSceneAdapter {
	/** KLineCharts 实例，仅在 Adapter 内部使用。 */
	readonly #chart: Chart;
	/** 引擎模块句柄，用于版本读取和精确销毁。 */
	readonly #engine: EngineHandle['module'];
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
	/** 当前受控拖动事务；progress 永不写入 #scene。 */
	#pointerInteraction: PointerInteraction | undefined;
	/** 确定性 opaque 交互 ID 序号。 */
	#interactionSequence = 0;

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
		this.#installInteractionListeners();
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

	#selectOverlay(id: string | null): void {
		const previousId = this.#selectedOverlayId;
		if (previousId === id) {
			return;
		}
		this.#selectedOverlayId = id;
		this.#emit({ type: 'overlay-selection-changed', previousId, id });
		if (id !== null) {
			this.#emit({ type: 'overlay-selected', id });
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
		const overlay = fromEngineOverlay(
			engineOverlay,
			currentSource,
			this.#idMap,
			path,
			this.#scene.symbol.pricePrecision,
		);
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
			onDeselected: ({ overlay }) => {
				if (this.#selectedOverlayId === overlay.id) {
					this.#selectOverlay(null);
				}
			},
			onRemoved: ({ overlay }) => {
				if (this.#scene.overlays.some((candidate) => candidate.id === overlay.id)) {
					this.#scene = parseChartScene({
						...structuredClone(this.#scene),
						overlays: this.#scene.overlays.filter((candidate) => candidate.id !== overlay.id),
					});
					if (this.#selectedOverlayId === overlay.id) {
						this.#selectOverlay(null);
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

	#installInteractionListeners(): void {
		this.#container.addEventListener('pointerdown', this.#handlePointerDown, true);
		this.#container.addEventListener('pointermove', this.#handlePointerMove, true);
		this.#container.addEventListener('pointerup', this.#handlePointerUp, true);
		this.#container.addEventListener('pointercancel', this.#handlePointerCancel, true);
		window.addEventListener('keydown', this.#handleKeyDown);
		window.addEventListener('blur', this.#handleWindowBlur);
	}

	#removeInteractionListeners(): void {
		this.#container.removeEventListener('pointerdown', this.#handlePointerDown, true);
		this.#container.removeEventListener('pointermove', this.#handlePointerMove, true);
		this.#container.removeEventListener('pointerup', this.#handlePointerUp, true);
		this.#container.removeEventListener('pointercancel', this.#handlePointerCancel, true);
		window.removeEventListener('keydown', this.#handleKeyDown);
		window.removeEventListener('blur', this.#handleWindowBlur);
	}

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

	#overlayGeometries(): readonly OverlayPixelGeometry[] {
		const geometries: OverlayPixelGeometry[] = [];
		for (let sceneIndex = 0; sceneIndex < this.#scene.overlays.length; sceneIndex++) {
			const overlay = this.#scene.overlays[sceneIndex];
			if (overlay === undefined || !overlay.visible) {
				continue;
			}
			if (overlay.type === 'horizontalStraightLine') {
				const anchor = overlay.anchor;
				if (anchor === undefined || !('value' in anchor)) {
					continue;
				}
				const paneFilter = this.#primaryAxisFilter(overlay.paneId);
				const paneMain = this.#chart.getDom(paneFilter.paneId, 'main');
				const containerRect = this.#container.getBoundingClientRect();
				const mainRect = paneMain?.getBoundingClientRect() ?? containerRect;
				const projected = this.#toPixel(
					{ timestamp: this.#scene.data[0]!.timestamp, value: anchor.value },
					overlay.paneId,
				);
				const start = { x: mainRect.left - containerRect.left, y: projected.y };
				const end = { x: mainRect.right - containerRect.left, y: projected.y };
				geometries.push({
					overlayId: overlay.id,
					sceneIndex,
					zLevel: overlay.zLevel,
					locked: overlay.locked,
					anchors: [{ x: (start.x + end.x) / 2, y: projected.y }],
					bodySegments: [[start, end]],
				});
				continue;
			}
			if (overlay.type === 'priceMeasurement' && overlay.start !== undefined && overlay.end !== undefined) {
				const start = this.#toPixel(overlay.start, overlay.paneId);
				const end = this.#toPixel(overlay.end, overlay.paneId);
				geometries.push({
					overlayId: overlay.id,
					sceneIndex,
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
					sceneIndex,
					zLevel: overlay.zLevel,
					locked: overlay.locked,
					anchors,
					bodySegments,
				});
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
		this.#stopPointerCapture(interaction);
		if (!interaction.started) {
			return;
		}
		const index = this.#scene.overlays.findIndex((overlay) => overlay.id === interaction.before.id);
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

	readonly #handlePointerDown = (event: PointerEvent): void => {
		if (this.#disposed || event.button !== 0 || this.#pointerInteraction !== undefined) {
			return;
		}
		const coordinate = this.#pointerCoordinate(event);
		const hit = hitTestOverlayGeometries(coordinate, this.#overlayGeometries());
		if (hit === null) {
			const selected = this.#scene.overlays.find(
				(overlay) => overlay.id === this.#selectedOverlayId,
			);
			if (selected !== undefined && isControlledInteractionOverlay(selected)) {
				this.#selectOverlay(null);
			}
			return;
		}
		const before = this.#scene.overlays.find((overlay) => overlay.id === hit.overlayId);
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
			const index = this.#scene.overlays.findIndex((overlay) => overlay.id === candidate.id);
			const overlays = structuredClone(this.#scene.overlays);
			overlays[index] = candidate;
			const parsed = parseChartScene({ ...structuredClone(this.#scene), overlays });
			const normalized = parsed.overlays[index]!;
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
		const interaction = this.#pointerInteraction;
		if (interaction === undefined || interaction.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.#pointerInteraction = undefined;
		this.#stopPointerCapture(interaction);
		if (!interaction.started) {
			return;
		}
		const overlay = interaction.candidate ?? interaction.before;
		const index = this.#scene.overlays.findIndex((candidate) => candidate.id === overlay.id);
		const overlays = structuredClone(this.#scene.overlays);
		overlays[index] = overlay;
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
		if (this.#pointerInteraction?.pointerId === event.pointerId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#cancelInteraction('pointer-cancel');
		}
	};

	readonly #handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape' && this.#pointerInteraction !== undefined) {
			this.#cancelInteraction('escape');
		}
	};

	readonly #handleWindowBlur = (): void => {
		if (this.#pointerInteraction !== undefined) {
			this.#cancelInteraction('window-blur');
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
		if (!this.#chart.overrideOverlay(toEngineOverlay(
			overlay,
			this.#idMap,
			`/overlays/${index}`,
			this.#overlayCallbacks(overlay),
		))) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/overlays/${index}`,
				`KLineCharts failed to update Overlay ${overlay.id}.`,
			);
		}
		this.#scene = candidate;
		if (styleChange) {
			this.#emit({ type: 'overlay-style-changed', before, overlay });
		}
		this.#emit({ type: 'overlay-updated', overlay });
		return structuredClone(overlay);
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
		this.#scene = candidate;
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
			runtimeVersion: this.#scene.runtime.runtimeVersion,
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
		this.#cancelInteraction('destroy');
		this.#disposed = true;
		this.#removeInteractionListeners();
		this.#listeners.clear();
		this.#engine.dispose(this.#container);
		this.#container.replaceChildren();
		this.#container.style.backgroundColor = this.#originalBackground;
	}
}
