import type {
	ChartScene,
	JsonObject,
	SceneIssue,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import type { SUPPORTED_OVERLAYS } from '@baron1996/klinecharts-adapter';

export type SupportedOverlayType = (typeof SUPPORTED_OVERLAYS)[number];

export type KLineSceneRuntimeEvent =
	| { readonly type: 'scene-ready'; readonly scene: ChartScene }
	| { readonly type: 'overlay-created'; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-updated'; readonly overlay: SceneOverlay }
	| { readonly type: 'overlay-removed'; readonly id: string }
	| { readonly type: 'overlay-selected'; readonly id: string }
	| { readonly type: 'scene-error'; readonly issues: readonly SceneIssue[] };

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
}

export interface StandardToolbar {
	readonly element: HTMLElement;
	destroy(): void;
}
