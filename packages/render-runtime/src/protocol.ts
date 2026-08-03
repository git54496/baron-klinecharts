import type {
	ChartScene,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';

export interface BaronSceneBridge {
	readonly ready: Promise<void>;
	canonicalizePng(encoded: string): string;
	exportScene(): ChartScene | TimeSeriesScene;
	destroy(): void;
}

declare global {
	interface Window {
		__BARON_KLINE_SCENE__: BaronSceneBridge;
	}
}

export {};
