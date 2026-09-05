import type { SceneOverlay } from '@baron1996/kline-scene-schema';
import { describe, expect, it } from 'vitest';

import { createDragCandidate } from '../src/interaction/dragging.js';

const styles: SceneOverlay['styles'] = {
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
};

const timestamps = [1000, 2000, 3000, 4000, 5000];
const measurement: SceneOverlay = {
	id: 'measurement',
	type: 'priceMeasurement',
	paneId: 'pane-candle',
	visible: true,
	locked: false,
	zLevel: 0,
	mode: 'normal',
	styles,
	start: { timestamp: 1000, value: 300 },
	end: { timestamp: 3000, value: 330 },
	metadata: { opaque: 'preserved' },
};

describe('M2 drag candidate semantics', () => {
	it('moves the whole measurement by one bar and one absolute price delta', () => {
		const candidate = createDragCandidate(
			measurement,
			{ target: 'body', anchorIndex: null },
			{ dataIndex: 1, value: 310 },
			{ dataIndex: 2, value: 315.555 },
			timestamps,
			2,
		);

		expect(candidate.start).toEqual({ timestamp: 2000, value: 305.56 });
		expect(candidate.end).toEqual({ timestamp: 4000, value: 335.56 });
		expect(candidate.end!.value - candidate.start!.value).toBe(30);
		expect(candidate.metadata).toEqual(measurement.metadata);
		expect(measurement.start).toEqual({ timestamp: 1000, value: 300 });
	});

	it('moves only the selected anchor and snaps its timestamp to an embedded bar', () => {
		const candidate = createDragCandidate(
			measurement,
			{ target: 'anchor', anchorIndex: 1 },
			{ dataIndex: 2, value: 330 },
			{ dataIndex: 4, value: 342.345 },
			timestamps,
			2,
		);

		expect(candidate.start).toEqual(measurement.start);
		expect(candidate.end).toEqual({ timestamp: 5000, value: 342.35 });
	});

	it('rejects a whole move outside the embedded bar range', () => {
		expect(() => createDragCandidate(
			measurement,
			{ target: 'body', anchorIndex: null },
			{ dataIndex: 0, value: 300 },
			{ dataIndex: 4, value: 310 },
			timestamps,
			2,
		)).toThrowError(expect.objectContaining({ code: 'INVALID_REFERENCE' }));
	});

	it('moves a segment anchor and body through the same controlled path', () => {
		const segment: SceneOverlay = {
			...measurement,
			id: 'segment',
			type: 'segment',
			start: undefined,
			end: undefined,
			points: [
				{ timestamp: 1000, value: 300 },
				{ timestamp: 3000, value: 330 },
			],
		};

		const anchor = createDragCandidate(
			segment,
			{ target: 'anchor', anchorIndex: 1 },
			{ dataIndex: 2, value: 330 },
			{ dataIndex: 4, value: 342.345 },
			timestamps,
			2,
		);
		expect(anchor.points).toEqual([
			{ timestamp: 1000, value: 300 },
			{ timestamp: 5000, value: 342.35 },
		]);

		const body = createDragCandidate(
			segment,
			{ target: 'body', anchorIndex: null },
			{ dataIndex: 1, value: 310 },
			{ dataIndex: 2, value: 315.555 },
			timestamps,
			2,
		);
		expect(body.points).toEqual([
			{ timestamp: 2000, value: 305.56 },
			{ timestamp: 4000, value: 335.56 },
		]);
	});

	it('moves a future segment anchor on the extrapolated chart timeline', () => {
		const day = 24 * 60 * 60 * 1000;
		const first = Date.UTC(2026, 8, 1);
		const dailyTimestamps = [first, first + day, first + day * 2];
		const segment: SceneOverlay = {
			...measurement,
			id: 'future-segment',
			type: 'segment',
			start: undefined,
			end: undefined,
			points: [
				{ timestamp: first, value: 300 },
				{ timestamp: first + day * 4, value: 330 },
			],
		};

		const candidate = createDragCandidate(
			segment,
			{ target: 'anchor', anchorIndex: 1 },
			{ dataIndex: 4, timestamp: first + day * 4, value: 330 },
			{ dataIndex: 5, timestamp: first + day * 5, value: 342.345 },
			dailyTimestamps,
			2,
			{ type: 'day', span: 1 },
		);

		expect(candidate.points).toEqual([
			{ timestamp: first, value: 300 },
			{ timestamp: first + day * 5, value: 342.35 },
		]);
	});

	it('moves a segment body while preserving a future endpoint offset', () => {
		const day = 24 * 60 * 60 * 1000;
		const first = Date.UTC(2026, 8, 1);
		const dailyTimestamps = [first, first + day, first + day * 2];
		const segment: SceneOverlay = {
			...measurement,
			id: 'future-segment-body',
			type: 'segment',
			start: undefined,
			end: undefined,
			points: [
				{ timestamp: first + day, value: 300 },
				{ timestamp: first + day * 4, value: 330 },
			],
		};

		const candidate = createDragCandidate(
			segment,
			{ target: 'body', anchorIndex: null },
			{ dataIndex: 1, timestamp: first + day, value: 310 },
			{ dataIndex: 2, timestamp: first + day * 2, value: 315.555 },
			dailyTimestamps,
			2,
			{ type: 'day', span: 1 },
		);

		expect(candidate.points).toEqual([
			{ timestamp: first + day * 2, value: 305.56 },
			{ timestamp: first + day * 5, value: 335.56 },
		]);
	});

	it('moves annotations and constrained horizontal segments without changing unrelated fields', () => {
		const annotation: SceneOverlay = {
			...measurement,
			id: 'annotation',
			type: 'simpleAnnotation',
			start: undefined,
			end: undefined,
			point: { timestamp: 2000, value: 310 },
			text: '重要位置',
		};
		const movedAnnotation = createDragCandidate(
			annotation,
			{ target: 'body', anchorIndex: null },
			{ dataIndex: 1, value: 310 },
			{ dataIndex: 2, value: 315.555 },
			timestamps,
			2,
		);
		expect(movedAnnotation.point).toEqual({ timestamp: 3000, value: 315.56 });
		expect(movedAnnotation.text).toBe('重要位置');

		const horizontal: SceneOverlay = {
			...measurement,
			id: 'horizontal',
			type: 'horizontalSegment',
			start: undefined,
			end: undefined,
			value: 310,
			startTimestamp: 1000,
			endTimestamp: 3000,
		};
		const movedHorizontal = createDragCandidate(
			horizontal,
			{ target: 'anchor', anchorIndex: 1 },
			{ dataIndex: 2, value: 310 },
			{ dataIndex: 4, value: 320.126 },
			timestamps,
			2,
		);
		expect(movedHorizontal).toMatchObject({
			value: 320.13,
			startTimestamp: 1000,
			endTimestamp: 5000,
		});
	});
});
