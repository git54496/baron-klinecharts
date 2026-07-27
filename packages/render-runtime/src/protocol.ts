import type { ChartScene } from '@baron1996/kline-scene-schema';

export interface BaronSceneBridge {
	readonly ready: Promise<void>;
	exportScene(): ChartScene;
	destroy(): void;
}

declare global {
	interface Window {
		__BARON_KLINE_SCENE__: BaronSceneBridge;
	}
}

export {};
