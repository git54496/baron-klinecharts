import type {
	ChartScene,
	JsonObject,
	SceneIssue,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import type { SUPPORTED_OVERLAYS } from '@baron1996/klinecharts-adapter';

export type SupportedOverlayType = (typeof SUPPORTED_OVERLAYS)[number];

export interface KLineSceneRuntimeEventEnvelope {
	readonly sceneVersion: 1;
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

interface OverlayDragEventIdentity {
	readonly interactionId: string;
	readonly overlayId: string;
	readonly target: OverlayDragTarget;
	readonly anchorIndex: number | null;
	readonly before: SceneOverlay;
}

type KLineSceneRuntimeEventPayload =
	| { readonly type: 'scene-ready'; readonly scene: ChartScene }
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
	readonly deleteBehavior?: 'direct' | 'request';
	readonly hostActions?: readonly {
		readonly actionId: string;
		readonly label: string;
	}[];
}

export interface StandardToolbar {
	readonly element: HTMLElement;
	destroy(): void;
}
