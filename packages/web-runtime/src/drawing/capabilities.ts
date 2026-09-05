import type {
	ChartScene,
	Drawing,
	MarketData,
	SceneIndicator,
} from '@baron1996/kline-scene-schema';
import type {
	EngineHistoricalDataCommitResult,
	EngineDrawingSnapshot,
	EnginePixelCoordinate,
	MainSeriesPresentation,
} from '@baron1996/klinecharts-adapter';
import type {
	HostActionDescriptor,
	RuntimeCapabilityDescriptor,
} from './runtime-capability-descriptor.js';
import type { WorkspaceRuntimeListener } from './workspace-events.js';
import type { AddIndicatorOptions } from '../types.js';

/** 公共 Drawing 能力；工具栏与所有正式交互式图表 Runtime 共用。 */
export interface DrawingRuntimeCapability {
	startDrawing(
		type: Drawing['type'],
		options?: {
			readonly text?: string;
			readonly id?: string;
			readonly groupId?: string;
			readonly styles?: Drawing['styles'];
			readonly metadata?: NonNullable<Drawing['metadata']>;
		},
	): string;
	listDrawings(): readonly EngineDrawingSnapshot[];
	getDrawing(id: string): EngineDrawingSnapshot | undefined;
	updateDrawingStyles(
		id: string,
		styles: Drawing['styles'],
	): EngineDrawingSnapshot;
	updateDrawingText(id: string, text: string): EngineDrawingSnapshot;
	updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot;
	removeDrawing(id: string): boolean;
	requestDrawingDelete(id: string): void;
	selectDrawing(id: string | null): void;
	getSelectedDrawingId(): string | undefined;
	hitTestDrawing(point: EnginePixelCoordinate): string | null;
	getDrawingMutationState(): 'ready' | 'busy';
	subscribeDrawingChanges(listener: () => void): () => void;
}

export interface RuntimeAuxiliaryCapability {
	getRuntimeCapabilityDescriptor(options?: {
		readonly hostActions?: readonly HostActionDescriptor[];
	}): RuntimeCapabilityDescriptor;
	exportArtifact(fileName?: string): {
		readonly bytes: Uint8Array;
		readonly mediaType: 'application/json';
		readonly fileName: string;
	};
	setValueAxisScale(scale: 'linear' | 'logarithmic'): Promise<ChartScene>;
	setMainSeriesPresentation(
		presentation: MainSeriesPresentation,
	): { readonly activeType: string };
	requestHostAction(actionId: string, drawingId?: string | null): void;
}

/** 由宿主接管网络请求的更早行情能力。 */
export interface HistoricalDataRuntimeCapability {
	commitHistoricalData(
		requestId: string,
		data: readonly MarketData[],
		hasMore: boolean,
	): EngineHistoricalDataCommitResult;
	rejectHistoricalData(requestId: string, message: string): boolean;
}

/** 主图指标配置能力；指标值由浏览器内图表引擎基于 OHLC 数据计算。 */
export interface MainIndicatorRuntimeCapability {
	listMainIndicators(): readonly SceneIndicator[];
	addMainIndicator(options: AddIndicatorOptions): SceneIndicator;
	removeMainIndicator(id: string): boolean;
}

/** 展示时区能力；不改变 Scene 的证券时区与 Drawing 坐标语义。 */
export interface DisplayTimezoneRuntimeCapability {
	getDisplayTimezone(): string;
	setDisplayTimezone(timezone: string): void;
}
