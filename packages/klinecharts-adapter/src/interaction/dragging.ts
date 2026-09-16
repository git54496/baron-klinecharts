import type { Period, SceneOverlay } from '@baron1996/kline-scene-schema';
import { SceneError } from '@baron1996/kline-scene-schema';

import { normalizePriceValue } from '../conversion/price.js';

export interface DragDataPoint {
	readonly dataIndex: number;
	readonly timestamp?: number;
	readonly value: number;
}

export interface DragTarget {
	readonly target: 'anchor' | 'body';
	readonly anchorIndex: number | null;
}

/** 拖动期间冻结的 Y 轴数值空间；整体平移必须在这个空间保持距离。 */
export interface DragValueAxis {
	readonly toAxisValue: (value: number) => number;
	readonly fromAxisValue: (value: number) => number;
}

const LINEAR_DRAG_VALUE_AXIS: DragValueAxis = {
	toAxisValue: (value) => value,
	fromAxisValue: (value) => value,
};

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
	period?: Period,
): number {
	const timestamp = timestamps[index];
	if (timestamp !== undefined) {
		return timestamp;
	}
	const first = timestamps[0];
	const last = timestamps[timestamps.length - 1];
	if (period !== undefined && first !== undefined && last !== undefined) {
		if (index < 0) {
			return extrapolateTimestamp(first, index, period);
		}
		if (index >= timestamps.length) {
			return extrapolateTimestamp(last, index - (timestamps.length - 1), period);
		}
	}
	throw new SceneError(
		'INVALID_REFERENCE',
		path,
		'Drag candidate must remain on the chart timeline.',
	);
}

function extrapolateTimestamp(reference: number, diff: number, period: Period): number {
	const { type, span } = period;
	const multiplier = type === 'second'
		? 1000
		: type === 'minute'
			? 60 * 1000
			: type === 'hour'
				? 60 * 60 * 1000
				: type === 'day'
					? 24 * 60 * 60 * 1000
					: type === 'week'
						? 7 * 24 * 60 * 60 * 1000
						: null;
	if (multiplier !== null) {
		return reference + span * multiplier * diff;
	}
	const date = new Date(reference);
	if (type === 'month') {
		const referenceDay = date.getDate();
		date.setDate(1);
		date.setMonth(date.getMonth() + span * diff);
		const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
		date.setDate(Math.min(referenceDay, lastDay));
		return date.getTime();
	}
	date.setFullYear(date.getFullYear() + span * diff);
	return date.getTime();
}

function outsideDataIndex(
	timestamp: number,
	timestamps: readonly number[],
	period: Period,
): number | null {
	const first = timestamps[0];
	const last = timestamps[timestamps.length - 1];
	if (first === undefined || last === undefined) {
		return null;
	}
	const reference = timestamp > last
		? { timestamp: last, index: timestamps.length - 1 }
		: timestamp < first
			? { timestamp: first, index: 0 }
			: null;
	if (reference === null) {
		return null;
	}
	const { type, span } = period;
	const divisor = type === 'second'
		? span * 1000
		: type === 'minute'
			? span * 60 * 1000
			: type === 'hour'
				? span * 60 * 60 * 1000
				: type === 'day'
					? span * 24 * 60 * 60 * 1000
					: type === 'week'
						? span * 7 * 24 * 60 * 60 * 1000
						: null;
	if (divisor !== null) {
		return reference.index + Math.floor((timestamp - reference.timestamp) / divisor);
	}
	const referenceDate = new Date(reference.timestamp);
	const currentDate = new Date(timestamp);
	const units = type === 'month'
		? (currentDate.getFullYear() - referenceDate.getFullYear()) * 12 +
			(currentDate.getMonth() - referenceDate.getMonth())
		: currentDate.getFullYear() - referenceDate.getFullYear();
	return reference.index + Math.floor(units / span);
}

function timestampAtCurrentPoint(
	current: DragDataPoint,
	timestamps: readonly number[],
	path: string,
	period?: Period,
): number {
	const index = requireDataIndex(current.dataIndex, `${path}/dataIndex`);
	if (
		(index < 0 || index >= timestamps.length) &&
		Number.isSafeInteger(current.timestamp)
	) {
		return current.timestamp!;
	}
	return requireTimestamp(timestamps, index, path, period);
}

function translatedTimestamp(
	timestamp: number,
	deltaIndex: number,
	timestamps: readonly number[],
	path: string,
	period?: Period,
): number {
	let sourceIndex = timestamps.indexOf(timestamp);
	if (sourceIndex < 0 && period !== undefined) {
		sourceIndex = outsideDataIndex(timestamp, timestamps, period) ?? -1;
	}
	if (sourceIndex < 0) {
		throw new SceneError(
			'INVALID_REFERENCE',
			path,
			'Overlay point must reference the chart timeline before dragging.',
		);
	}
	return requireTimestamp(timestamps, sourceIndex + deltaIndex, path, period);
}

function normalizedValue(value: number, pricePrecision: number, path: string): number {
	return normalizePriceValue(value, pricePrecision, path);
}

function translatedValue(
	value: number,
	deltaAxisValue: number,
	valueAxis: DragValueAxis,
	pricePrecision: number,
	path: string,
): number {
	const translated = valueAxis.fromAxisValue(valueAxis.toAxisValue(value) + deltaAxisValue);
	if (!Number.isFinite(translated)) {
		throw new SceneError('SCENE_SCHEMA_INVALID', path, 'Dragged price must remain finite.');
	}
	return normalizedValue(translated, pricePrecision, path);
}

function translatedPoint(
	point: { readonly timestamp: number; readonly value: number },
	deltaIndex: number,
	deltaAxisValue: number,
	timestamps: readonly number[],
	pricePrecision: number,
	path: string,
	period?: Period,
	valueAxis: DragValueAxis = LINEAR_DRAG_VALUE_AXIS,
): { readonly timestamp: number; readonly value: number } {
	return {
		timestamp: translatedTimestamp(point.timestamp, deltaIndex, timestamps, `${path}/timestamp`, period),
		value: translatedValue(
			point.value, deltaAxisValue, valueAxis, pricePrecision, `${path}/value`,
		),
	};
}

function currentPoint(
	current: DragDataPoint,
	timestamps: readonly number[],
	pricePrecision: number,
	path: string,
	period?: Period,
): { readonly timestamp: number; readonly value: number } {
	return {
		timestamp: timestampAtCurrentPoint(current, timestamps, `${path}/timestamp`, period),
		value: normalizedValue(current.value, pricePrecision, `${path}/value`),
	};
}

/** 根据冻结的时间索引与 Y 轴数值空间构造未提交候选，不修改输入 Overlay。 */
export function createDragCandidate(
	before: SceneOverlay,
	dragTarget: DragTarget,
	origin: DragDataPoint,
	current: DragDataPoint,
	timestamps: readonly number[],
	pricePrecision: number,
	period?: Period,
	valueAxis: DragValueAxis = LINEAR_DRAG_VALUE_AXIS,
): SceneOverlay {
	const deltaAxisValue = valueAxis.toAxisValue(current.value) - valueAxis.toAxisValue(origin.value);
	if (!Number.isFinite(deltaAxisValue)) {
		throw new SceneError('SCENE_SCHEMA_INVALID', '/overlays', 'Drag axis delta must be finite.');
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
				value: dragTarget.target === 'anchor'
					? normalizedValue(current.value, pricePrecision, '/overlays/anchor/value')
					: translatedValue(
						anchor.value, deltaAxisValue, valueAxis,
						pricePrecision, '/overlays/anchor/value',
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
					? timestampAtCurrentPoint(current, timestamps, '/overlays/anchor', period)
					: translatedTimestamp(
						anchor.timestamp, deltaIndex, timestamps, '/overlays/anchor/timestamp', period,
					),
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
			candidate.value = dragTarget.target === 'anchor'
				? normalizedValue(current.value, pricePrecision, '/overlays/value')
				: translatedValue(
					before.value, deltaAxisValue, valueAxis, pricePrecision, '/overlays/value',
				);
			if (dragTarget.target === 'anchor') {
				const timestamp = timestampAtCurrentPoint(
					current, timestamps, '/overlays/anchor', period,
				);
				if (dragTarget.anchorIndex === 0) candidate.startTimestamp = timestamp;
				else if (dragTarget.anchorIndex === 1) candidate.endTimestamp = timestamp;
				else throw new SceneError('INVALID_REFERENCE', '/overlays/anchorIndex', 'Invalid anchor index.');
			} else {
				candidate.startTimestamp = translatedTimestamp(
					before.startTimestamp, deltaIndex, timestamps, '/overlays/startTimestamp', period,
				);
				candidate.endTimestamp = translatedTimestamp(
					before.endTimestamp, deltaIndex, timestamps, '/overlays/endTimestamp', period,
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
				? timestampAtCurrentPoint(current, timestamps, '/overlays/anchor', period)
				: translatedTimestamp(
					before.timestamp, deltaIndex, timestamps, '/overlays/timestamp', period,
				);
			if (dragTarget.target === 'anchor') {
				const value = normalizedValue(current.value, pricePrecision, '/overlays/anchor/value');
				if (dragTarget.anchorIndex === 0) candidate.startValue = value;
				else if (dragTarget.anchorIndex === 1) candidate.endValue = value;
				else throw new SceneError('INVALID_REFERENCE', '/overlays/anchorIndex', 'Invalid anchor index.');
			} else {
				candidate.startValue = translatedValue(
					before.startValue, deltaAxisValue, valueAxis,
					pricePrecision, '/overlays/startValue',
				);
				candidate.endValue = translatedValue(
					before.endValue, deltaAxisValue, valueAxis,
					pricePrecision, '/overlays/endValue',
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
					current, timestamps, pricePrecision, `/overlays/points/${dragTarget.anchorIndex}`, period,
				);
			} else {
				candidate.points = before.points.map((point, index) => translatedPoint(
					point, deltaIndex, deltaAxisValue, timestamps, pricePrecision,
					`/overlays/points/${index}`, period, valueAxis,
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
				? currentPoint(current, timestamps, pricePrecision, '/overlays/point', period)
				: translatedPoint(
					before.point, deltaIndex, deltaAxisValue, timestamps, pricePrecision,
					'/overlays/point', period, valueAxis,
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
				const point = currentPoint(
					current, timestamps, pricePrecision, '/overlays/anchor', period,
				);
				if (dragTarget.anchorIndex === 0) candidate.start = point;
				else if (dragTarget.anchorIndex === 1) candidate.end = point;
				else throw new SceneError('INVALID_REFERENCE', '/overlays/anchorIndex', 'Invalid anchor index.');
			} else {
				candidate.start = translatedPoint(
					before.start, deltaIndex, deltaAxisValue, timestamps, pricePrecision,
					'/overlays/start', period, valueAxis,
				);
				candidate.end = translatedPoint(
					before.end, deltaIndex, deltaAxisValue, timestamps, pricePrecision,
					'/overlays/end', period, valueAxis,
				);
			}
			return candidate;
		}
	}
}
