import type {
	ChartScene,
	Drawing,
	MarketData,
} from '@baron1996/kline-scene-schema';

export interface EngineDrawingTarget {
	readonly paneRole: string;
	readonly yAxisRole: 'primary';
}

/** 引擎无关的 Drawing 快照；不出现 Chart、Overlay 实例或引擎内部 ID。 */
export interface EngineDrawingSnapshot {
	readonly id: string;
	readonly type: Drawing['type'];
	readonly groupId?: string;
	readonly target: EngineDrawingTarget;
	readonly geometry: Drawing['geometry'];
	readonly styles: Drawing['styles'];
	readonly metadata?: NonNullable<Drawing['metadata']>;
	readonly text?: string;
	readonly locked: boolean;
	readonly visible: boolean;
	readonly zLevel: number;
	readonly mode: Drawing['mode'];
}

export interface EngineDrawingStartRequest {
	readonly id: string;
	readonly type: Drawing['type'];
	readonly groupId?: string;
	readonly target: EngineDrawingTarget;
	readonly styles: Drawing['styles'];
	readonly metadata?: NonNullable<Drawing['metadata']>;
	readonly text?: string;
}

export type EngineDrawingEventType =
	| 'created'
	| 'updated'
	| 'removed'
	| 'selected'
	| 'deselected'
	| 'edit-candidate';

export interface EngineDrawingEvent {
	readonly type: EngineDrawingEventType;
	readonly id: string;
	readonly drawing?: EngineDrawingSnapshot;
	readonly editDimensions?: {
		readonly horizontal: boolean;
		readonly vertical: boolean;
	};
}

export interface EnginePointProjection {
	readonly x?: number;
	readonly y?: number;
	readonly timestamp?: number;
	readonly value?: number;
}

export interface EnginePixelCoordinate {
	readonly x: number;
	readonly y: number;
}

/** 宿主加载更早行情所需的纯数据请求；不暴露 KLineCharts 的 forward 命名。 */
export interface EngineHistoricalDataRequest {
	readonly requestId: string;
	readonly beforeTimestamp: number;
	readonly period: ChartScene['period'];
	readonly dataCount: number;
}

export interface EngineHistoricalDataCommitResult {
	readonly scene: ChartScene;
	readonly addedCount: number;
	readonly hasMore: boolean;
}

/** Chart Adapter 可选实现的历史行情端口。 */
export interface HistoricalDataEnginePort {
	configureHistoricalDataLoading(hasMore: boolean): void;
	subscribeHistoricalDataRequests(
		listener: (request: EngineHistoricalDataRequest) => void,
	): () => void;
	commitHistoricalData(
		requestId: string,
		data: readonly MarketData[],
		hasMore: boolean,
	): EngineHistoricalDataCommitResult;
	rejectHistoricalData(requestId: string): boolean;
}

/**
 * 两个 Scene Adapter 共同实现的公共 Drawing 引擎端口。
 * 所有 DTO 都是纯数据；端口调用方不能取得 Chart/Overlay 实例或引擎内部 ID。
 */
export interface DrawingEnginePort {
	readonly sceneKind: 'chart' | 'time-series';
	restoreDrawings(drawings: readonly EngineDrawingSnapshot[]): void;
	startDrawing(request: EngineDrawingStartRequest): string;
	listDrawings(): readonly EngineDrawingSnapshot[];
	getDrawing(id: string): EngineDrawingSnapshot | undefined;
	updateDrawingStyles(
		id: string,
		styles: Drawing['styles'],
	): EngineDrawingSnapshot;
	updateDrawingText(id: string, text: string): EngineDrawingSnapshot;
	updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot;
	restoreDrawing(snapshot: EngineDrawingSnapshot): void;
	removeDrawing(id: string): boolean;
	selectDrawing(id: string | null): void;
	hitTestDrawing(point: EnginePixelCoordinate): string | null;
	projectToPixel(
		anchor: { readonly timestamp?: number; readonly value?: number },
		paneRole: string,
	): EnginePointProjection;
	unprojectFromPixel(
		point: EnginePixelCoordinate,
		paneRole: string,
	): EnginePointProjection;
	setMutationsEnabled(enabled: boolean): void;
	subscribeDrawingEvents(
		listener: (event: EngineDrawingEvent) => void,
	): () => void;
	dispose(): void;
}
