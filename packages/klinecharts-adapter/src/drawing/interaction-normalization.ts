import type {
	EngineDrawingEvent,
	EngineDrawingSnapshot,
} from './engine-port.js';

export interface InteractionDimensions {
	readonly horizontal: boolean;
	readonly vertical: boolean;
}

/** 归一化后的引擎交互事件；编辑维度由 Adapter 拖动会话显式提供，不靠数值猜测。 */
export interface NormalizedDrawingEvent {
	readonly type: EngineDrawingEvent['type'];
	readonly id: string;
	readonly snapshot: EngineDrawingSnapshot;
	readonly dimensions: InteractionDimensions;
}

export function normalizeCreatedEvent(
	snapshot: EngineDrawingSnapshot,
): NormalizedDrawingEvent {
	return {
		type: 'created',
		id: snapshot.id,
		snapshot,
		dimensions: { horizontal: true, vertical: true },
	};
}

export function normalizeUpdatedEvent(
	snapshot: EngineDrawingSnapshot,
	dimensions: InteractionDimensions,
): NormalizedDrawingEvent {
	return {
		type: 'updated',
		id: snapshot.id,
		snapshot,
		dimensions,
	};
}

export function normalizeEditCandidateEvent(
	snapshot: EngineDrawingSnapshot,
	dimensions: InteractionDimensions,
): NormalizedDrawingEvent {
	return {
		type: 'edit-candidate',
		id: snapshot.id,
		snapshot,
		dimensions,
	};
}

export function normalizeRemovedEvent(
	snapshot: EngineDrawingSnapshot,
): NormalizedDrawingEvent {
	return {
		type: 'removed',
		id: snapshot.id,
		snapshot,
		dimensions: { horizontal: false, vertical: false },
	};
}

export function normalizeSelectionEvent(
	id: string,
	type: 'selected' | 'deselected',
): NormalizedDrawingEvent {
	return {
		type,
		id,
		snapshot: {
			id,
			type: 'horizontalStraightLine',
			target: { paneRole: '', yAxisRole: 'primary' },
			geometry: { value: 0 },
			styles: {
				line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
				fill: { color: 'rgba(41, 98, 255, 0.15)' },
				text: {
					color: 'rgba(255, 255, 255, 1)',
					size: 12,
					family: 'Baron Sans',
					weight: 'normal',
					backgroundColor: 'rgba(41, 98, 255, 1)',
					borderColor: 'rgba(41, 98, 255, 1)',
				},
			},
			locked: false,
			visible: true,
			zLevel: 0,
			mode: 'normal',
		},
		dimensions: { horizontal: false, vertical: false },
	};
}
