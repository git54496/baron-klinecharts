import type { Drawing } from '@baron1996/kline-scene-schema';

export interface EngineDrawingTarget {
	readonly paneRole: string;
	readonly yAxisRole: 'primary';
}

/** 引擎无关的 Drawing 快照；不出现 Chart、Overlay 实例或引擎内部 ID。 */
export interface EngineDrawingSnapshot {
	readonly id: string;
	readonly type: Drawing['type'];
	readonly target: EngineDrawingTarget;
	readonly geometry: Drawing['geometry'];
	readonly styles: Drawing['styles'];
	readonly text?: string;
	readonly locked: boolean;
	readonly visible: boolean;
	readonly zLevel: number;
	readonly mode: Drawing['mode'];
}

export interface EngineDrawingStartRequest {
	readonly id: string;
	readonly type: Drawing['type'];
	readonly target: EngineDrawingTarget;
	readonly styles: Drawing['styles'];
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
