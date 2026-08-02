import type { SceneOverlay } from '@baron1996/kline-scene-schema';
import { SceneError } from '@baron1996/kline-scene-schema';

import { normalizePriceValue } from '../conversion/price.js';

export interface DragDataPoint {
	readonly dataIndex: number;
	readonly value: number;
}

export interface DragTarget {
	readonly target: 'anchor' | 'body';
	readonly anchorIndex: number | null;
}

function requireDataIndex(value: number, path: string): number {
	if (!Number.isFinite(value)) {
		throw new SceneError('INVALID_REFERENCE', path, 'Drag data index must be finite.');
	}
	return Math.round(value);
}

function requireTimestamp(
	timestamps: readonly number[],
	index: number,
	path: string,
): number {
	const timestamp = timestamps[index];
	if (timestamp === undefined) {
		throw new SceneError(
			'INVALID_REFERENCE',
			path,
			'Drag candidate must remain on an embedded market-data bar.',
		);
	}
	return timestamp;
}

/** 根据冻结的绝对平移语义构造未提交候选，不修改输入 Overlay。 */
export function createDragCandidate(
	before: SceneOverlay,
	dragTarget: DragTarget,
	origin: DragDataPoint,
	current: DragDataPoint,
	timestamps: readonly number[],
	pricePrecision: number,
): SceneOverlay {
	const deltaValue = current.value - origin.value;
	if (!Number.isFinite(deltaValue)) {
		throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays', 'Drag price delta must be finite.');
	}
	if (before.type === 'horizontalStraightLine') {
		const anchor = before.anchor;
		if (anchor === undefined || !('value' in anchor)) {
			throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays/anchor', 'Missing price anchor.');
		}
		return {
			...structuredClone(before),
			anchor: {
				value: normalizePriceValue(
					anchor.value + deltaValue,
					pricePrecision,
					'/overlays/anchor/value',
				),
			},
		};
	}
	if (before.type !== 'priceMeasurement' || before.start === undefined || before.end === undefined) {
		throw new SceneError(
			'SCENE_SCHEMA_INVALID',
			'/overlays/type',
			'Controlled M2 dragging only supports horizontalStraightLine and priceMeasurement.',
		);
	}

	const candidate = structuredClone(before);
	if (dragTarget.target === 'anchor') {
		if (dragTarget.anchorIndex !== 0 && dragTarget.anchorIndex !== 1) {
			throw new SceneError('INVALID_REFERENCE', '/overlays/anchorIndex', 'Invalid anchor index.');
		}
		const index = requireDataIndex(current.dataIndex, '/overlays/anchor/dataIndex');
		const point = {
			timestamp: requireTimestamp(timestamps, index, '/overlays/anchor/timestamp'),
			value: normalizePriceValue(
				current.value,
				pricePrecision,
				'/overlays/anchor/value',
			),
		};
		if (dragTarget.anchorIndex === 0) {
			candidate.start = point;
		} else {
			candidate.end = point;
		}
		return candidate;
	}

	const startIndex = timestamps.indexOf(before.start.timestamp);
	const endIndex = timestamps.indexOf(before.end.timestamp);
	if (startIndex < 0 || endIndex < 0) {
		throw new SceneError(
			'INVALID_REFERENCE',
			'/overlays',
			'priceMeasurement endpoints must reference embedded bars before dragging.',
		);
	}
	const deltaIndex =
		requireDataIndex(current.dataIndex, '/overlays/body/dataIndex') -
		requireDataIndex(origin.dataIndex, '/overlays/body/originDataIndex');
	candidate.start = {
		timestamp: requireTimestamp(timestamps, startIndex + deltaIndex, '/overlays/start/timestamp'),
		value: normalizePriceValue(
			before.start.value + deltaValue,
			pricePrecision,
			'/overlays/start/value',
		),
	};
	candidate.end = {
		timestamp: requireTimestamp(timestamps, endIndex + deltaIndex, '/overlays/end/timestamp'),
		value: normalizePriceValue(
			before.end.value + deltaValue,
			pricePrecision,
			'/overlays/end/value',
		),
	};
	return candidate;
}
