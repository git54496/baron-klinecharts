import type {
	ChartScene,
	DrawableWorkspaceDocument,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';
import { parseChartScene, parseTimeSeriesScene } from '@baron1996/kline-scene-schema';
import {
	KLineChartsSceneAdapter,
	KLineDrawingProjectionPolicy,
	TimeSeriesChartsAdapter,
	TimeSeriesDrawingProjectionPolicy,
	type DrawingEnginePort,
	type DrawingProjectionPolicy,
} from '@baron1996/klinecharts-adapter';

export interface SceneRuntimeRegistration {
	readonly sceneKind: 'chart' | 'time-series';
	parseScene(value: unknown): ChartScene | TimeSeriesScene;
	createAdapter(
		container: HTMLElement,
		workspace: DrawableWorkspaceDocument,
		options?: SceneRuntimeAdapterOptions,
	): Promise<DrawingEnginePort>;
	createPolicy(): DrawingProjectionPolicy;
	readonly defaultTarget: {
		readonly paneRole: string;
		readonly yAxisRole: 'primary';
	};
}

export interface SceneRuntimeAdapterOptions {
	readonly historicalDataLoading?: { readonly hasMore: boolean };
}

const registrations = new Map<string, SceneRuntimeRegistration>();

export function registerSceneRuntime(
	registration: SceneRuntimeRegistration,
): void {
	registrations.set(registration.sceneKind, registration);
}

export function getSceneRuntime(
	kind: 'chart' | 'time-series',
): SceneRuntimeRegistration {
	const registration = registrations.get(kind);
	if (registration === undefined) {
		throw new Error(`No Scene Runtime registered for kind: ${kind}.`);
	}
	return registration;
}

registerSceneRuntime({
	sceneKind: 'chart',
	parseScene: (value) => parseChartScene(value),
	createAdapter: (container, workspace, options) =>
		KLineChartsSceneAdapter.createWorkspace(container, workspace, options),
	createPolicy: () => new KLineDrawingProjectionPolicy(),
	defaultTarget: { paneRole: 'candle', yAxisRole: 'primary' },
});

registerSceneRuntime({
	sceneKind: 'time-series',
	parseScene: (value) => parseTimeSeriesScene(value),
	createAdapter: (container, workspace) =>
		TimeSeriesChartsAdapter.createWorkspace(container, workspace),
	createPolicy: () => new TimeSeriesDrawingProjectionPolicy(),
	defaultTarget: { paneRole: 'time-series', yAxisRole: 'primary' },
});
