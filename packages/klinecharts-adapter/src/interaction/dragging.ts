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

function normalizedValue(value: number, pricePrecision: number, path: string): number {
	return normalizePriceValue(value, pricePrecision, path);
}

function timestampAtCurrentPoint(current: DragDataPoint, timestamps: readonly number[], path: string): number {
	return requireTimestamp(timestamps, requireDataIndex(current.dataIndex, `${path}/dataIndex`), path);
}

function translatedTimestamp(
	timestamp: number,
	deltaIndex: number,
	timestamps: readonly number[],
	path: string,
): number {
	const sourceIndex = timestamps.indexOf(timestamp);
	if (sourceIndex < 0) {
		throw new SceneError('INVALID_REFERENCE', path, 'Overlay point must reference an embedded bar before dragging.');
	}
	return requireTimestamp(timestamps, sourceIndex + deltaIndex, path);
}

function translatedPoint(
	point: { readonly timestamp: number; readonly value: number },
	deltaIndex: number,
	deltaValue: number,
	timestamps: readonly number[],
	pricePrecision: number,
	path: string,
): { readonly timestamp: number; readonly value: number } {
	return {
		timestamp: translatedTimestamp(point.timestamp, deltaIndex, timestamps, `${path}/timestamp`),
		value: normalizedValue(point.value + deltaValue, pricePrecision, `${path}/value`),
	};
}

function currentPoint(
	current: DragDataPoint,
	timestamps: readonly number[],
	pricePrecision: number,
	path: string,
): { readonly timestamp: number; readonly value: number } {
	return {
		timestamp: timestampAtCurrentPoint(current, timestamps, `${path}/timestamp`),
		value: normalizedValue(current.value, pricePrecision, `${path}/value`),
	};
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
	const candidate = structuredClone(before);
	const deltaIndex =
		requireDataIndex(current.dataIndex, '/overlays/body/dataIndex') -
		requireDataIndex(origin.dataIndex, '/overlays/body/originDataIndex');

	switch (before.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag': {
			const anchor = before.anchor;
			if (anchor === undefined || !('value' in anchor)) {
				throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays/anchor', 'Missing price anchor.');
			}
			candidate.anchor = {
				value: normalizedValue(
					dragTarget.target === 'anchor' ? current.value : anchor.value + deltaValue,
					pricePrecision,
					'/overlays/anchor/value',
				),
			};
			return candidate;
		}
		case 'verticalStraightLine': {
			const anchor = before.anchor;
			if (anchor === undefined || !('timestamp' in anchor)) {
				throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays/anchor', 'Missing time anchor.');
			}
			candidate.anchor = {
				timestamp: dragTarget.target === 'anchor'
					? timestampAtCurrentPoint(current, timestamps, '/overlays/anchor')
					: translatedTimestamp(anchor.timestamp, deltaIndex, timestamps, '/overlays/anchor/timestamp'),
			};
			return candidate;
		}
		case 'horizontalRayLine':
		case 'horizontalSegment': {
			if (
				before.value === undefined || before.startTimestamp === undefined ||
				before.endTimestamp === undefined
			) {
				throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays', 'Missing horizontal line geometry.');
			}
			candidate.value = normalizedValue(
				dragTarget.target === 'anchor' ? current.value : before.value + deltaValue,
				pricePrecision,
				'/overlays/value',
			);
			if (dragTarget.target === 'anchor') {
				const timestamp = timestampAtCurrentPoint(current, timestamps, '/overlays/anchor');
				if (dragTarget.anchorIndex === 0) candidate.startTimestamp = timestamp;
				else if (dragTarget.anchorIndex === 1) candidate.endTimestamp = timestamp;
				else throw new SceneError('INVALID_REFERENCE', '/overlays/anchorIndex', 'Invalid anchor index.');
			} else {
				candidate.startTimestamp = translatedTimestamp(
					before.startTimestamp, deltaIndex, timestamps, '/overlays/startTimestamp',
				);
				candidate.endTimestamp = translatedTimestamp(
					before.endTimestamp, deltaIndex, timestamps, '/overlays/endTimestamp',
				);
			}
			return candidate;
		}
		case 'verticalRayLine':
		case 'verticalSegment': {
			if (
				before.timestamp === undefined || before.startValue === undefined ||
				before.endValue === undefined
			) {
				throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays', 'Missing vertical line geometry.');
			}
			candidate.timestamp = dragTarget.target === 'anchor'
				? timestampAtCurrentPoint(current, timestamps, '/overlays/anchor')
				: translatedTimestamp(before.timestamp, deltaIndex, timestamps, '/overlays/timestamp');
			if (dragTarget.target === 'anchor') {
				const value = normalizedValue(current.value, pricePrecision, '/overlays/anchor/value');
				if (dragTarget.anchorIndex === 0) candidate.startValue = value;
				else if (dragTarget.anchorIndex === 1) candidate.endValue = value;
				else throw new SceneError('INVALID_REFERENCE', '/overlays/anchorIndex', 'Invalid anchor index.');
			} else {
				candidate.startValue = normalizedValue(
					before.startValue + deltaValue, pricePrecision, '/overlays/startValue',
				);
				candidate.endValue = normalizedValue(
					before.endValue + deltaValue, pricePrecision, '/overlays/endValue',
				);
			}
			return candidate;
		}
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush': {
			if (before.points === undefined) {
				throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays/points', 'Missing point geometry.');
			}
			if (dragTarget.target === 'anchor') {
				if (dragTarget.anchorIndex === null || before.points[dragTarget.anchorIndex] === undefined) {
					throw new SceneError('INVALID_REFERENCE', '/overlays/anchorIndex', 'Invalid anchor index.');
				}
				candidate.points![dragTarget.anchorIndex] = currentPoint(
					current, timestamps, pricePrecision, `/overlays/points/${dragTarget.anchorIndex}`,
				);
			} else {
				candidate.points = before.points.map((point, index) => translatedPoint(
					point, deltaIndex, deltaValue, timestamps, pricePrecision, `/overlays/points/${index}`,
				)) as NonNullable<SceneOverlay['points']>;
			}
			return candidate;
		}
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
		case 'crossLine': {
			if (before.point === undefined) {
				throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays/point', 'Missing point geometry.');
			}
			candidate.point = dragTarget.target === 'anchor'
				? currentPoint(current, timestamps, pricePrecision, '/overlays/point')
				: translatedPoint(
					before.point, deltaIndex, deltaValue, timestamps, pricePrecision, '/overlays/point',
				);
			return candidate;
		}
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement': {
			if (before.start === undefined || before.end === undefined) {
				throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays', 'Missing two-point geometry.');
			}
			if (dragTarget.target === 'anchor') {
				const point = currentPoint(current, timestamps, pricePrecision, '/overlays/anchor');
				if (dragTarget.anchorIndex === 0) candidate.start = point;
				else if (dragTarget.anchorIndex === 1) candidate.end = point;
				else throw new SceneError('INVALID_REFERENCE', '/overlays/anchorIndex', 'Invalid anchor index.');
			} else {
				candidate.start = translatedPoint(
					before.start, deltaIndex, deltaValue, timestamps, pricePrecision, '/overlays/start',
				);
				candidate.end = translatedPoint(
					before.end, deltaIndex, deltaValue, timestamps, pricePrecision, '/overlays/end',
				);
			}
			return candidate;
		}
	}
}
