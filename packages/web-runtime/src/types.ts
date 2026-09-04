import type {
	ChartScene,
	JsonObject,
	SceneIssue,
	SceneOverlay,
	SceneIndicator,
} from '@baron1996/kline-scene-schema';
import type { SUPPORTED_OVERLAYS } from '@baron1996/klinecharts-adapter';
import type { HostActionDescriptor } from './drawing/runtime-capability-descriptor.js';

export type SupportedOverlayType = (typeof SUPPORTED_OVERLAYS)[number];

export interface KLineSceneRuntimeEventEnvelope {
	readonly sceneVersion: ChartScene['version'];
	readonly runtimeVersion: '0.2.0';
}

export type OverlayDragTarget = 'body' | 'anchor';
export type OverlayDragCancelReason =
	| 'escape'
	| 'pointer-cancel'
	| 'window-blur'
	| 'destroy'
	| 'validation-error';
export type PriceScale = 'linear' | 'logarithmic';

export interface RuntimeCrosshairBar {
	readonly open: number;
	readonly high: number;
	readonly low: number;
	readonly close: number;
	readonly volume: number | null;
}

export interface AddIndicatorOptions {
	readonly id?: string;
	readonly name: SceneIndicator['name'];
	readonly paneId?: string;
	readonly yAxisId?: string;
	readonly calcParams: readonly number[];
	readonly precision?: number;
	readonly visible?: boolean;
	readonly zLevel?: number;
	readonly styles?: SceneIndicator['styles'];
}

interface OverlayDragEventIdentity {
	readonly interactionId: string;
	readonly overlayId: string;
	readonly target: OverlayDragTarget;
	readonly anchorIndex: number | null;
	readonly before: SceneOverlay;
}

type KLineSceneRuntimeEventPayload =
	| { readonly type: 'scene-ready'; readonly scene: ChartScene }
	| { readonly type: 'indicator-created'; readonly indicator: SceneIndicator }
	| { readonly type: 'indicator-removed'; readonly id: string }
	| { readonly type: 'overlay-created'; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-updated'; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-style-changed'; readonly before: SceneOverlay; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-removed'; readonly id: string }
	| { readonly type: 'overlay-selection-changed'; readonly previousId: string | null; readonly id: string | null }
	| { readonly type: 'overlay-selected'; readonly id: string }
	| ({ readonly type: 'overlay-drag-started' } & OverlayDragEventIdentity)
	| ({ readonly type: 'overlay-dragging'; readonly candidate: SceneOverlay } & OverlayDragEventIdentity)
	| ({ readonly type: 'overlay-drag-committed'; readonly overlay: SceneOverlay } & OverlayDragEventIdentity)
	| ({ readonly type: 'overlay-drag-cancelled'; readonly reason: OverlayDragCancelReason } & OverlayDragEventIdentity)
	| { readonly type: 'overlay-delete-requested'; readonly overlayId: string }
	| { readonly type: 'host-action-requested'; readonly actionId: string; readonly overlayId: string | null }
	| { readonly type: 'crosshair-changed'; readonly timestamp: number | null; readonly bar: RuntimeCrosshairBar | null }
	| { readonly type: 'fullscreen-changed'; readonly active: boolean }
	| { readonly type: 'scene-error'; readonly issues: readonly SceneIssue[] };

export type KLineSceneRuntimeEvent =
	KLineSceneRuntimeEventPayload & KLineSceneRuntimeEventEnvelope;

export type KLineSceneRuntimeListener = (event: KLineSceneRuntimeEvent) => void;

export interface KLineSceneRuntimeOptions {
	readonly onEvent?: KLineSceneRuntimeListener;
}

export interface StartOverlayDrawingOptions {
	readonly id?: string;
	readonly paneId?: string;
	readonly groupId?: string;
	readonly visible?: boolean;
	readonly locked?: boolean;
	readonly zLevel?: number;
	readonly mode?: SceneOverlay['mode'];
	readonly styles?: SceneOverlay['styles'];
	readonly metadata?: JsonObject;
	readonly text?: string;
}

export interface StandardToolbarOptions {
	readonly downloadFileName?: string;
	readonly hostActions?: readonly HostActionDescriptor[];
	readonly mainSeriesPresentationControl?: 'hidden' | 'enabled';
}

export interface DrawingFloatingToolbarOptions {
	readonly deleteBehavior?: 'direct' | 'request';
	readonly draggable?: boolean;
}

export interface DrawingFloatingToolbar {
	readonly element: HTMLElement;
	resetPosition(): void;
	destroy(): void;
}

export interface StandardToolbar {
	readonly element: HTMLElement;
	/** 宿主需要整体只读时，独立禁用所有依赖真实数据的动作。 */
	setDataActionsDisabled(disabled: boolean): void;
	/** 只禁用画线创建与文本输入，保留已就绪历史 Scene 的轴和导出能力。 */
	setDrawingActionsDisabled(disabled: boolean): void;
	setHostActionState(
		actionId: string,
		state: {
			readonly pressed?: boolean;
			readonly disabled?: boolean;
			readonly pending?: boolean;
			readonly errorMessage?: string | null;
		},
	): void;
	destroy(): void;
}
