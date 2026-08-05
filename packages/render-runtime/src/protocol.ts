import type {
	ChartScene,
	DrawableWorkspaceDocument,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';

export interface BaronSceneBridge {
	readonly ready: Promise<void>;
	canonicalizePng(encoded: string): string;
	exportScene(): ChartScene | TimeSeriesScene;
	destroy(): void;
}

export interface BaronWorkspaceBridge {
	readonly ready: Promise<void>;
	canonicalizePng(encoded: string): string;
	exportWorkspace(): DrawableWorkspaceDocument;
	destroy(): void;
}

declare global {
	interface Window {
		__BARON_KLINE_SCENE__: BaronSceneBridge;
		__BARON_DRAWABLE_WORKSPACE__: BaronWorkspaceBridge;
	}
}

export {};
