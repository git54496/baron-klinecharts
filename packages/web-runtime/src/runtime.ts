import type {
	ChartScene,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import {
	parseChartScene,
	SceneError,
} from '@baron1996/kline-scene-schema';
import {
	KLineChartsSceneAdapter,
	type AdapterSceneEvent,
	type OverlayHitResult,
	type OverlayDrawingRequest,
	type PixelCoordinate,
} from '@baron1996/klinecharts-adapter';

import { RuntimeEventBus } from './events.js';
import { runRuntimeTeardowns } from './lifecycle.js';
import type {
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

function toRuntimeEvent(event: AdapterSceneEvent): KLineSceneRuntimeEvent {
	return {
		...structuredClone(event),
		sceneVersion: 1,
		runtimeVersion: '0.2.0',
	} as KLineSceneRuntimeEvent;
}

/**
 * 面向 Web、离线 HTML 和测试渲染器的纯场景 Runtime。
 * 该类没有撤销/重做栈，也不公开 KLineCharts Chart 实例。
 */
export class KLineSceneRuntime {
	/** 唯一引擎 Adapter。 */
	readonly #adapter: KLineChartsSceneAdapter;
	/** Runtime 事件总线。 */
	readonly #events = new RuntimeEventBus();
	/** Adapter 事件解绑函数。 */
	readonly #unsubscribeAdapter: () => void;
	/** 当前选中标注的稳定 ID。 */
	#selectedOverlayId: string | null = null;
	/** 确定性标注 ID 递增序号。 */
	#overlaySequence = 0;
	/** 防止销毁后的 API 继续访问引擎。 */
	#destroyed = false;

	private constructor(
		adapter: KLineChartsSceneAdapter,
		options: KLineSceneRuntimeOptions,
	) {
		this.#adapter = adapter;
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
			this.#events.emit(toRuntimeEvent(event));
		});
	}

	public static async create(
		container: HTMLElement,
		value: unknown,
		options: KLineSceneRuntimeOptions = {},
	): Promise<KLineSceneRuntime> {
		try {
			const scene = parseChartScene(value);
			const adapter = await KLineChartsSceneAdapter.create(container, scene);
			const runtime = new KLineSceneRuntime(adapter, options);
			runtime.#events.emit({
				type: 'scene-ready',
				scene: runtime.getScene(),
				sceneVersion: 1,
				runtimeVersion: '0.2.0',
			});
			return runtime;
		} catch (error) {
			if (options.onEvent !== undefined && error instanceof SceneError) {
				options.onEvent({
					type: 'scene-error',
					issues: structuredClone(error.issues),
					sceneVersion: 1,
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
			sceneVersion: 1,
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
			sceneVersion: 1,
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
		runRuntimeTeardowns(this);
		this.#adapter.dispose();
		this.#unsubscribeAdapter();
		this.#events.clear();
	}
}

export async function createKLineSceneRuntime(
	container: HTMLElement,
	scene: unknown,
	options: KLineSceneRuntimeOptions = {},
): Promise<KLineSceneRuntime> {
	return KLineSceneRuntime.create(container, scene, options);
}
