import {
	serializeCanonicalScene,
	type ChartScene,
	type SceneIndicator,
	type SceneOverlay,
} from '@baron1996/kline-scene-schema';
import {
	parseChartScene,
	SceneError,
} from '@baron1996/kline-scene-schema';
import {
	KLineChartsSceneAdapter,
	STANDARD_CLOSE_LINE_PRESENTATION,
	SUPPORTED_OVERLAYS,
	type ActiveMainSeriesType,
	type AdapterSceneEvent,
	type EngineDrawingSnapshot,
	type EnginePixelCoordinate,
	type MainSeriesPresentation,
	type OverlayHitResult,
	type OverlayDrawingRequest,
	type PixelCoordinate,
} from '@baron1996/klinecharts-adapter';

import type {
	DrawingRuntimeCapability,
	RuntimeAuxiliaryCapability,
} from './drawing/capabilities.js';
import { overlayToDrawingSnapshot } from './drawing/legacy-runtime-capability.js';
import type {
	HostActionDescriptor,
	RuntimeCapabilityDescriptor,
} from './drawing/runtime-capability-descriptor.js';
import { RuntimeEventBus } from './events.js';
import { defaultIndicatorStyles } from './indicator-presentation.js';
import { runRuntimeTeardowns } from './lifecycle.js';
import type {
	AddIndicatorOptions,
	KLineSceneRuntimeEvent,
	KLineSceneRuntimeListener,
	KLineSceneRuntimeOptions,
	PriceScale,
	StartOverlayDrawingOptions,
	SupportedOverlayType,
} from './types.js';

export const DEFAULT_OVERLAY_STYLES: SceneOverlay['styles'] = {
	line: {
		color: 'rgba(41, 98, 255, 1)',
		size: 1,
		style: 'solid',
	},
	fill: {
		color: 'rgba(41, 98, 255, 0.15)',
	},
	text: {
		color: 'rgba(255, 255, 255, 1)',
		size: 12,
		family: 'Baron Sans',
		weight: 'normal',
		backgroundColor: 'rgba(41, 98, 255, 1)',
		borderColor: 'rgba(41, 98, 255, 1)',
	},
};

function toRuntimeEvent(
	event: AdapterSceneEvent,
	sceneVersion: ChartScene['version'],
): KLineSceneRuntimeEvent {
	return {
		...structuredClone(event),
		sceneVersion,
		runtimeVersion: '0.2.0',
	} as KLineSceneRuntimeEvent;
}

function requestedSceneVersion(value: unknown): ChartScene['version'] {
	if (typeof value === 'object' && value !== null && 'version' in value && value.version === 2) {
		return 2;
	}
	return 1;
}

/**
 * 面向 Web、离线 HTML 和测试渲染器的纯场景 Runtime。
 * 该类没有撤销/重做栈，也不公开 KLineCharts Chart 实例。
 */
export class KLineSceneRuntime implements DrawingRuntimeCapability, RuntimeAuxiliaryCapability {
	/** 唯一引擎 Adapter。 */
	readonly #adapter: KLineChartsSceneAdapter;
	/** 当前场景协议版本，所有 Runtime 事件必须原样透传。 */
	readonly #sceneVersion: ChartScene['version'];
	/** Runtime 事件总线。 */
	readonly #events = new RuntimeEventBus();
	/** Adapter 事件解绑函数。 */
	readonly #unsubscribeAdapter: () => void;
	/** Adapter 十字线监听解绑函数。 */
	#unsubscribeCrosshair: (() => void) | null = null;
	/** 当前选中标注的稳定 ID。 */
	#selectedOverlayId: string | null = null;
	/** 供对象级编辑器订阅 Drawing 变化，不暴露 Adapter 事件。 */
	readonly #drawingChangeListeners = new Set<() => void>();
	/** 确定性标注 ID 递增序号。 */
	#overlaySequence = 0;
	/** 确定性指标 ID 递增序号。 */
	#indicatorSequence = 0;
	/** 全屏状态变化监听器。 */
	readonly #fullscreenChangeHandler = (): void => {
		if (this.#destroyed) {
			return;
		}
		this.#events.emit({
			type: 'fullscreen-changed',
			active: this.isFullscreen(),
			sceneVersion: this.#sceneVersion,
			runtimeVersion: '0.2.0',
		});
	};
	/** 防止销毁后的 API 继续访问引擎。 */
	#destroyed = false;

	private constructor(
		adapter: KLineChartsSceneAdapter,
		options: KLineSceneRuntimeOptions,
		sceneVersion: ChartScene['version'],
	) {
		this.#adapter = adapter;
		this.#sceneVersion = sceneVersion;
		if (options.onEvent !== undefined) {
			this.#events.subscribe(options.onEvent);
		}
		this.#unsubscribeAdapter = adapter.subscribe((event) => {
			if (event.type === 'overlay-selection-changed') {
				this.#selectedOverlayId = event.id;
			}
			if (
				event.type === 'overlay-removed' &&
				this.#selectedOverlayId === event.id
			) {
				this.#selectedOverlayId = null;
			}
			this.#events.emit(toRuntimeEvent(event, this.#sceneVersion));
			if (event.type.startsWith('overlay-')) {
				for (const listener of this.#drawingChangeListeners) {
					listener();
				}
			}
		});
		this.#unsubscribeCrosshair = adapter.subscribeCrosshair((snapshot) => {
			this.#events.emit({
				type: 'crosshair-changed',
				timestamp: snapshot.timestamp,
				bar: snapshot.bar,
				sceneVersion: this.#sceneVersion,
				runtimeVersion: '0.2.0',
			});
		});
		document.addEventListener('fullscreenchange', this.#fullscreenChangeHandler);
	}

	readonly #defaultFileName = 'kline-scene.json';


	public static async create(
		container: HTMLElement,
		value: unknown,
		options: KLineSceneRuntimeOptions = {},
	): Promise<KLineSceneRuntime> {
		try {
			const scene = parseChartScene(value);
			const adapter = await KLineChartsSceneAdapter.create(container, scene);
			const runtime = new KLineSceneRuntime(adapter, options, scene.version);
			runtime.#events.emit({
				type: 'scene-ready',
				scene: runtime.getScene(),
				sceneVersion: scene.version,
				runtimeVersion: '0.2.0',
			});
			return runtime;
		} catch (error) {
			if (options.onEvent !== undefined && error instanceof SceneError) {
				options.onEvent({
					type: 'scene-error',
					issues: structuredClone(error.issues),
					sceneVersion: requestedSceneVersion(value),
					runtimeVersion: '0.2.0',
				});
			}
			throw error;
		}
	}

	#assertActive(): void {
		if (this.#destroyed) {
			throw new SceneError('RUNTIME_INIT_FAILED', '/', 'The Web Runtime has been destroyed.');
		}
	}

	#nextOverlayId(type: SupportedOverlayType): string {
		const existing = new Set(this.#adapter.listOverlays().map((overlay) => overlay.id));
		let id = '';
		do {
			id = `overlay-${type}-${this.#overlaySequence}`;
			this.#overlaySequence++;
		} while (existing.has(id));
		return id;
	}

	#nextIndicatorId(name: SceneIndicator['name']): string {
		const existing = new Set(
			this.#adapter.listIndicators().map((indicator) => indicator.id),
		);
		let id = '';
		do {
			id = `indicator-${name.toLowerCase()}-${this.#indicatorSequence}`;
			this.#indicatorSequence++;
		} while (existing.has(id));
		return id;
	}

	public getScene(): ChartScene {
		this.#assertActive();
		return structuredClone(this.#adapter.exportScene());
	}

	public exportScene(): ChartScene {
		return this.getScene();
	}

	public async setPriceScale(scale: PriceScale): Promise<ChartScene> {
		this.#assertActive();
		return structuredClone(await this.#adapter.setPriceScale(scale));
	}

	public projectPoint(
		point: { readonly timestamp: number; readonly value: number },
		paneId?: string,
	): PixelCoordinate {
		this.#assertActive();
		return structuredClone(this.#adapter.projectPoint(point, paneId));
	}

	public hitTestOverlay(point: PixelCoordinate): OverlayHitResult | null {
		this.#assertActive();
		return structuredClone(this.#adapter.hitTestOverlay(point));
	}

	public startOverlayDrawing(
		type: SupportedOverlayType,
		options: StartOverlayDrawingOptions = {},
	): string {
		this.#assertActive();
		const scene = this.#adapter.exportScene();
		const candlePaneId = scene.panes.find((pane) => pane.kind === 'candle')!.id;
		const request: OverlayDrawingRequest = {
			id: options.id ?? this.#nextOverlayId(type),
			type,
			paneId: options.paneId ?? candlePaneId,
			visible: options.visible ?? true,
			locked: options.locked ?? false,
			zLevel: options.zLevel ?? 0,
			mode: options.mode ?? 'normal',
			styles: structuredClone(options.styles ?? DEFAULT_OVERLAY_STYLES),
			...(options.groupId === undefined ? {} : { groupId: options.groupId }),
			...(options.metadata === undefined
				? {}
				: { metadata: structuredClone(options.metadata) }),
			...(
				type === 'simpleAnnotation' ||
				type === 'simpleTag' ||
				type === 'callout' ||
				type === 'text'
					? { text: options.text ?? '' }
					: {}
			),
		};
		return this.#adapter.startOverlayDrawing(request);
	}

	public getRuntimeCapabilityDescriptor(
		options: Readonly<{ readonly hostActions?: readonly HostActionDescriptor[] }> = {},
	): RuntimeCapabilityDescriptor {
		const scene = this.getScene();
		const pane = scene.panes.find((candidate) => candidate.kind === 'candle');
		const primaryAxis = pane?.yAxes.find((axis) => axis.role === 'primary');
		const supportedScales = scene.runtime.runtimeVersion === '0.2.0'
			? ['linear', 'logarithmic'] as const
			: ['linear'] as const;
		return {
			drawingTypes: [...SUPPORTED_OVERLAYS],
			valueAxis: {
				supportedScales,
				activeScale: primaryAxis?.scale ?? 'linear',
				mutable: true,
			},
			exportArtifact: {
				kind: 'chart-scene',
				mediaType: 'application/json',
				defaultFileName: this.#defaultFileName,
			},
			hostActions: options.hostActions ?? [],
			mainSeriesPresentation: {
				presentations: [
					{ type: 'candle_solid' },
					{ type: 'candle_stroke' },
					{ type: 'candle_up_stroke' },
					{ type: 'candle_down_stroke' },
					{ type: 'ohlc' },
					STANDARD_CLOSE_LINE_PRESENTATION,
				],
				activeType: scene.chart.candle.type as ActiveMainSeriesType,
				mutable: true,
			},
		};
	}

	public setValueAxisScale(scale: PriceScale): Promise<ChartScene> {
		return this.setPriceScale(scale);
	}

	public setMainSeriesPresentation(
		presentation: MainSeriesPresentation,
	): { readonly activeType: string } {
		return this.#adapter.applyMainSeriesPresentation(presentation);
	}

	public startDrawing(
		type: SupportedOverlayType,
		options?: Omit<StartOverlayDrawingOptions, 'paneId' | 'text'> & { readonly text?: string },
	): string {
		const resolved = options === undefined
			? {}
			: options;
		return this.startOverlayDrawing(type, resolved);
	}

	public listDrawings(): readonly EngineDrawingSnapshot[] {
		return this.listOverlays().map((overlay) =>
			overlayToDrawingSnapshot(overlay, this.getScene().period),
		);
	}

	public getDrawing(id: string): EngineDrawingSnapshot | undefined {
		const overlay = this.getOverlay(id);
		return overlay === undefined
			? undefined
			: overlayToDrawingSnapshot(overlay, this.getScene().period);
	}

	public updateDrawingStyles(
		id: string,
		styles: SceneOverlay['styles'],
	): EngineDrawingSnapshot {
		return overlayToDrawingSnapshot(
			this.updateOverlayStyles(id, styles),
			this.getScene().period,
		);
	}

	public updateDrawingText(id: string, text: string): EngineDrawingSnapshot {
		const overlay = this.getOverlay(id);
		if (overlay === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				`/overlays/${id}`,
				`Overlay ${id} does not exist.`,
			);
		}
		if (
			overlay.type !== 'simpleTag' &&
			overlay.type !== 'simpleAnnotation' &&
			overlay.type !== 'callout' &&
			overlay.type !== 'text'
		) {
			throw new SceneError(
				'SCENE_SCHEMA_INVALID',
				`/overlays/${id}/text`,
				'Text updates are only supported on text Drawing types.',
			);
		}
		return overlayToDrawingSnapshot(
			this.updateOverlay({ ...overlay, text }),
			this.getScene().period,
		);
	}

	public updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot {
		const overlay = this.getOverlay(id);
		if (overlay === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				`/overlays/${id}`,
				`Overlay ${id} does not exist.`,
			);
		}
		return overlayToDrawingSnapshot(
			this.updateOverlay({ ...overlay, locked }),
			this.getScene().period,
		);
	}

	public removeDrawing(id: string): boolean {
		return this.removeOverlay(id);
	}

	public removeDrawings(ids: readonly string[]): boolean {
		let removed = false;
		for (const id of new Set(ids)) {
			removed = this.removeOverlay(id) || removed;
		}
		return removed;
	}

	public requestDrawingDelete(id: string): void {
		this.requestOverlayDelete(id);
	}

	public getSelectedDrawingId(): string | undefined {
		return this.getSelectedOverlayId();
	}

	public selectDrawing(id: string | null): void {
		this.#adapter.selectDrawing(id);
	}

	public hitTestDrawing(point: EnginePixelCoordinate): string | null {
		return this.#adapter.hitTestOverlay(point)?.overlayId ?? null;
	}

	public getDrawingMutationState(): 'ready' {
		this.#assertActive();
		return 'ready';
	}

	public subscribeDrawingChanges(listener: () => void): () => void {
		this.#assertActive();
		this.#drawingChangeListeners.add(listener);
		return () => {
			this.#drawingChangeListeners.delete(listener);
		};
	}

	public exportArtifact(fileName = this.#defaultFileName): {
		bytes: Uint8Array;
		mediaType: 'application/json';
		fileName: string;
	} {
		return {
			bytes: serializeCanonicalScene(this.exportScene()),
			mediaType: 'application/json',
			fileName,
		};
	}

	public addOverlay(overlay: SceneOverlay): SceneOverlay {
		this.#assertActive();
		return structuredClone(this.#adapter.addOverlay(structuredClone(overlay)));
	}

	public updateOverlay(overlay: SceneOverlay): SceneOverlay {
		this.#assertActive();
		return structuredClone(this.#adapter.updateOverlay(structuredClone(overlay)));
	}

	public updateOverlayStyles(
		id: string,
		styles: SceneOverlay['styles'],
	): SceneOverlay {
		this.#assertActive();
		return structuredClone(this.#adapter.updateOverlayStyles(id, structuredClone(styles)));
	}

	public removeOverlay(id: string): boolean {
		this.#assertActive();
		return this.#adapter.removeOverlay(id);
	}

	public requestOverlayDelete(id: string): void {
		this.#assertActive();
		if (this.#adapter.getOverlay(id) === undefined) {
			throw new SceneError('INVALID_REFERENCE', '/overlays', `Overlay ${id} does not exist.`);
		}
		this.#events.emit({
			type: 'overlay-delete-requested',
			overlayId: id,
			sceneVersion: this.#sceneVersion,
			runtimeVersion: '0.2.0',
		});
	}

	public requestHostAction(
		actionId: string,
		overlayId: string | null = this.#selectedOverlayId,
	): void {
		this.#assertActive();
		if (actionId.length === 0) {
			throw new SceneError('SCENE_SCHEMA_INVALID', '/actionId', 'Host actionId must be non-empty.');
		}
		if (overlayId !== null && this.#adapter.getOverlay(overlayId) === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/overlayId',
				`Overlay ${overlayId} does not exist.`,
			);
		}
		this.#events.emit({
			type: 'host-action-requested',
			actionId,
			overlayId,
			sceneVersion: this.#sceneVersion,
			runtimeVersion: '0.2.0',
		});
	}

	public getOverlay(id: string): SceneOverlay | undefined {
		this.#assertActive();
		const overlay = this.#adapter.getOverlay(id);
		return overlay === undefined ? undefined : structuredClone(overlay);
	}

	public listOverlays(): readonly SceneOverlay[] {
		this.#assertActive();
		return structuredClone(this.#adapter.listOverlays());
	}

	public listIndicators(): readonly SceneIndicator[] {
		this.#assertActive();
		return this.#adapter.listIndicators();
	}

	public addIndicator(options: AddIndicatorOptions): SceneIndicator {
		this.#assertActive();
		const scene = this.#adapter.exportScene();
		const candlePane = scene.panes.find((pane) => pane.kind === 'candle');
		if (candlePane === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/panes',
				'Candle pane does not exist.',
			);
		}
		const paneId = options.paneId ?? candlePane.id;
		const pane = scene.panes.find((candidate) => candidate.id === paneId);
		if (pane === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				'/panes',
				`Pane ${paneId} does not exist.`,
			);
		}
		const yAxisId =
			options.yAxisId ??
			pane.yAxes.find((axis) => axis.role === 'primary')?.id;
		if (yAxisId === undefined) {
			throw new SceneError(
				'INVALID_REFERENCE',
				`/panes/${paneId}/yAxes`,
				'Primary Y-axis does not exist.',
			);
		}
		const indicator: SceneIndicator = {
			id: options.id ?? this.#nextIndicatorId(options.name),
			name: options.name,
			paneId,
			yAxisId,
			calcParams: [...options.calcParams],
			precision: options.precision ?? 2,
			visible: options.visible ?? true,
			zLevel: options.zLevel ?? 0,
			styles:
				options.styles ??
				defaultIndicatorStyles(options.name, options.calcParams),
		};
		return this.#adapter.addIndicator(indicator);
	}

	public removeIndicator(id: string): boolean {
		this.#assertActive();
		return this.#adapter.removeIndicator(id);
	}

	public async enterFullscreen(): Promise<void> {
		this.#assertActive();
		const element = this.#adapterContainer() as HTMLElement & {
			requestFullscreen?: () => Promise<void>;
		};
		if (typeof element.requestFullscreen !== 'function') {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				'/fullscreen',
				'Fullscreen API is unavailable.',
			);
		}
		await element.requestFullscreen();
	}

	public async exitFullscreen(): Promise<void> {
		this.#assertActive();
		if (typeof document.exitFullscreen !== 'function') {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				'/fullscreen',
				'Fullscreen API is unavailable.',
			);
		}
		await document.exitFullscreen();
	}

	public isFullscreen(): boolean {
		return document.fullscreenElement === this.#adapterContainer();
	}

	#adapterContainer(): HTMLElement {
		return this.#adapter.getContainer();
	}

	public getSelectedOverlayId(): string | undefined {
		this.#assertActive();
		return this.#selectedOverlayId ?? undefined;
	}

	public subscribe(listener: KLineSceneRuntimeListener): () => void {
		this.#assertActive();
		return this.#events.subscribe(listener);
	}

	public destroy(): void {
		if (this.#destroyed) {
			return;
		}
		this.#destroyed = true;
		document.removeEventListener('fullscreenchange', this.#fullscreenChangeHandler);
		this.#unsubscribeCrosshair?.();
		this.#unsubscribeCrosshair = null;
		runRuntimeTeardowns(this);
		this.#adapter.dispose();
		this.#unsubscribeAdapter();
		this.#events.clear();
		this.#drawingChangeListeners.clear();
	}
}

export async function createKLineSceneRuntime(
	container: HTMLElement,
	scene: unknown,
	options: KLineSceneRuntimeOptions = {},
): Promise<KLineSceneRuntime> {
	return KLineSceneRuntime.create(container, scene, options);
}
