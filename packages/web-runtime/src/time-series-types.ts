import type {
	TimeSeriesPoint,
	TimeSeriesScene,
	TimeSeriesSceneIssue,
} from '@baron1996/kline-scene-schema';

export interface TimeSeriesRuntimeEventEnvelope {
	readonly sceneVersion: 1;
	readonly runtimeVersion: '0.1.0';
}

export type TimeSeriesRuntimeEventPayload =
	| { readonly type: 'scene-ready'; readonly scene: TimeSeriesScene }
	| {
		readonly type: 'series-visibility-changed';
		readonly seriesId: string;
		readonly visible: boolean;
		readonly scene: TimeSeriesScene;
	}
	| {
		readonly type: 'data-replaced';
		readonly dataCount: number;
		readonly scene: TimeSeriesScene;
	}
	| {
		readonly type: 'crosshair-changed';
		readonly timestamp: number;
		readonly values: Readonly<Record<string, number | null>>;
	}
	| {
		readonly type: 'crosshair-changed';
		readonly timestamp: null;
		readonly values: null;
	}
	| {
		readonly type: 'scene-error';
		readonly issues: readonly TimeSeriesSceneIssue[];
	};

export type TimeSeriesRuntimeEvent =
	TimeSeriesRuntimeEventPayload & TimeSeriesRuntimeEventEnvelope;

export type TimeSeriesRuntimeListener = (
	event: TimeSeriesRuntimeEvent,
) => void;

export interface TimeSeriesRuntimeOptions {
	readonly onEvent?: TimeSeriesRuntimeListener;
}

export interface TimeSeriesRuntime {
	setSeriesVisible(seriesId: string, visible: boolean): TimeSeriesScene;
	replaceData(data: readonly TimeSeriesPoint[]): Promise<TimeSeriesScene>;
	exportScene(): TimeSeriesScene;
	subscribe(listener: TimeSeriesRuntimeListener): () => void;
	destroy(): void;
}
