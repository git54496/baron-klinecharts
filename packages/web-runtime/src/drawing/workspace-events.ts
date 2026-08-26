import type {
	ChartScene,
	DrawingDocument,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';
import type { EngineDrawingSnapshot } from '@baron1996/klinecharts-adapter';
import type { EngineHistoricalDataRequest } from '@baron1996/klinecharts-adapter';
import type { ActiveMainSeriesType } from '@baron1996/klinecharts-adapter';

export const WORKSPACE_EVENT_PROTOCOL = '@baron1996/drawable-workspace-events' as const;
export const WORKSPACE_EVENT_PROTOCOL_VERSION = '1.0.0' as const;

export interface WorkspaceEventEnvelope {
	readonly protocol: typeof WORKSPACE_EVENT_PROTOCOL;
	readonly protocolVersion: typeof WORKSPACE_EVENT_PROTOCOL_VERSION;
	readonly runtimeId: string;
	readonly sequence: number;
}

export type WorkspaceDrawingOperation =
	| 'create'
	| 'update'
	| 'style-change'
	| 'text-change'
	| 'delete'
	| 'select'
	| 'deselect';

export interface DrawingCandidateEventPayload {
	readonly requestId: string;
	readonly operation: WorkspaceDrawingOperation;
	readonly before?: EngineDrawingSnapshot;
	readonly candidate: EngineDrawingSnapshot;
	readonly candidateDocument: DrawingDocument;
	readonly canonicalHash: string;
}

export interface WorkspaceSceneSnapshot {
	readonly kind: 'chart' | 'time-series';
	readonly document: ChartScene | TimeSeriesScene;
}

export type WorkspaceRuntimeEvent =
	| ({ readonly type: 'drawing-candidate' } & DrawingCandidateEventPayload)
	| ({
			readonly type: 'drawing-committed';
			readonly requestId: string;
			readonly drawing: EngineDrawingSnapshot;
			readonly document: DrawingDocument;
			readonly canonicalHash: string;
	  })
	| ({
			readonly type: 'drawing-rejected';
			readonly requestId: string;
			readonly drawing: EngineDrawingSnapshot;
			readonly document: DrawingDocument;
			readonly canonicalHash: string;
	  })
	| { readonly type: 'selection-changed'; readonly id: string | null }
	| { readonly type: 'scene-replaced'; readonly scene: WorkspaceSceneSnapshot }
	| ({ readonly type: 'historical-data-requested' } & EngineHistoricalDataRequest)
	| {
			readonly type: 'historical-data-appended';
			readonly requestId: string;
			readonly addedCount: number;
			readonly totalCount: number;
			readonly hasMore: boolean;
	  }
	| {
			readonly type: 'historical-data-rejected';
			readonly requestId: string;
			readonly message: string;
	  }
	| { readonly type: 'value-axis-scale-changed'; readonly scale: 'linear' | 'logarithmic' }
	| { readonly type: 'main-series-presentation-changed'; readonly activeType: ActiveMainSeriesType }
	| {
			readonly type: 'host-action-requested';
			readonly actionId: string;
			readonly drawingId: string | null;
	  }
	| { readonly type: 'workspace-error'; readonly code: string; readonly message: string }
	| { readonly type: 'destroyed' };

export type WorkspaceRuntimeEventEnvelope = WorkspaceRuntimeEvent & WorkspaceEventEnvelope;

export type WorkspaceRuntimeListener = (
	event: WorkspaceRuntimeEventEnvelope,
) => void;

/** 深冻结快照，避免监听器修改事件载荷。 */
export function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		for (const child of Object.values(value as Record<string, unknown>)) {
			deepFreeze(child);
		}
		Object.freeze(value);
	}
	return value;
}
