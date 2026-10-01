import { describe, expect, it } from 'vitest';
import type { SceneOverlay } from '@baron1996/kline-scene-schema';
import { readTextBox, textBoxLayout, textMetadata, textPeriodLabel, textTimeIndex, textIndexTime } from '../src/drawing/text-box.js';
import { createDragCandidate } from '../src/interaction/dragging.js';
import { signedLogValue, signedLogPrice } from '../src/conversion/log-price-ticks.js';
const timestamps = [0, 7200000, 14400000, 21600000, 28800000, 36000000];
const overlay = { id: 'text', type: 'text', paneId: 'candle', visible: true, locked: false, zLevel: 0, mode: 'normal', point: { timestamp: 7200000, value: 100 }, text: '内容', metadata: textMetadata({}, { type: 'hour', span: 2 }, { end: { timestamp: 36000000, value: 90 }, width: 120, height: 24 }) } as SceneOverlay;
describe('bounded text geometry', () => {
	it('an eight-hour range projects to four 2H bars and one third of a daily bar', () => {
		expect(textTimeIndex(36000000, timestamps, 7200000) - textTimeIndex(7200000, timestamps, 7200000)).toBe(4);
		expect(textTimeIndex(36000000, [0, 86400000], 86400000) - textTimeIndex(7200000, [0, 86400000], 86400000)).toBeCloseTo(1 / 3);
		expect(textIndexTime(1 / 3, [0, 86400000], 86400000)).toBe(28800000);
	});
	it('collapses by projected size without changing canonical bounds', () => {
		const box = readTextBox(overlay.metadata)!;
		expect(textBoxLayout({ x: 100, y: 100 }, { x: 220, y: 124 }, box).collapsed).toBe(false);
		expect(textBoxLayout({ x: 100, y: 100 }, { x: 110, y: 124 }, box).collapsed).toBe(true);
		expect(textBoxLayout({ x: 100, y: 100 }, { x: 220, y: 110 }, box).collapsed).toBe(true);
		expect(textPeriodLabel({ type: 'hour', span: 2 })).toBe('2H');
		expect(textPeriodLabel({ type: 'month', span: 1 })).toBe('1M');
	});
	for (const index of [0, 1, 2, 3])
		it(`resizes corner ${index} and leaves the opposite axes fixed`, () => {
			const after = createDragCandidate(overlay, { target: 'anchor', anchorIndex: index }, { dataIndex: 1, value: 100 }, { dataIndex: 2, value: 105 }, timestamps, 2, { type: 'hour', span: 2 });
			const end = readTextBox(after.metadata)!.end;
			expect(after.point!.timestamp).toBe(index === 0 || index === 3 ? 14400000 : 7200000);
			expect(after.point!.value).toBe(index === 0 || index === 2 ? 105 : 100);
			expect(end.timestamp).toBe(index === 1 || index === 2 ? 14400000 : 36000000);
			expect(end.value).toBe(index === 1 || index === 3 ? 105 : 90);
		});
	it('body translation retains the eight-hour span on coarse buckets', () => {
		const after = createDragCandidate(overlay, { target: 'body', anchorIndex: null }, { dataIndex: 0, value: 100 }, { dataIndex: 1, value: 110 }, [0, 86400000, 172800000], 2, { type: 'day', span: 1 });
		expect(readTextBox(after.metadata)!.end.timestamp - after.point!.timestamp).toBe(28800000);
		expect(after.point!.value).toBe(110);
		expect(readTextBox(after.metadata)!.end.value).toBe(100);
	});
	it('body translation uses log space for both prices', () => {
		const axis = { toAxisValue: (v: number) => signedLogValue(v), fromAxisValue: (v: number) => signedLogPrice(v) };
		const after = createDragCandidate(overlay, { target: 'body', anchorIndex: null }, { dataIndex: 1, value: 100 }, { dataIndex: 1, value: 200 }, timestamps, 2, { type: 'hour', span: 2 }, axis);
		expect(after.point!.value).toBe(200);
		expect(readTextBox(after.metadata)!.end.value).toBe(180);
	});
});
