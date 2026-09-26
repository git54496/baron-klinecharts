import { describe, expect, it, vi } from 'vitest';
import type { Chart } from 'klinecharts';
import { candleCoordinate, candleGeometry, CANDLE_ZOOM_LEVELS, nearestCandleLevel } from '../src/candle-zoom-levels.js';
import { installCandleSpacing } from '../src/engine-candle-spacing.js';

describe('fixed candle zoom geometry', () => {
	it.each([1, 1.25, 1.5, 2, 3])('has equal physical gaps at every level and pan phase, DPR %s', dpr => {
		let previous = 0;
		for (let level = 0; level < CANDLE_ZOOM_LEVELS.length; level++) {
			const geometry = candleGeometry(level, dpr);
			expect(geometry.pitch).toBeGreaterThan(previous);
			previous = geometry.pitch;
			expect(nearestCandleLevel(geometry.pitch, dpr)).toBe(level);
			expect(geometry.bodyPixels).toBeGreaterThanOrEqual(1);
			expect(geometry.gapPixels).toBeGreaterThanOrEqual(1);
			for (let phase = -2; phase < 2; phase += 0.07) {
				for (const index of [-10000, -1, 0, 1, 9999]) {
					const left = candleCoordinate(phase, index, geometry) * dpr - geometry.bodyPixels / 2;
					const next = candleCoordinate(phase, index + 1, geometry) * dpr - geometry.bodyPixels / 2;
					expect(left).toBeCloseTo(Math.round(left), 7);
					expect(next - left - geometry.bodyPixels).toBeCloseTo(geometry.gapPixels, 7);
				}
			}
		}
	});
	it('clamps endpoints and snaps saved fractional widths to the nearest level', () => {
		expect(candleGeometry(-1)).toEqual(candleGeometry(0));
		expect(candleGeometry(100)).toEqual(candleGeometry(CANDLE_ZOOM_LEVELS.length - 1));
		expect(candleGeometry(nearestCandleLevel(3.6)).pitch).toBe(4);
		expect(candleGeometry(nearestCandleLevel(5)).pitch).toBe(4);
		expect(candleGeometry(nearestCandleLevel(0.1)).pitch).toBe(2);
	});
	it('preserves continuous fractional drawing coordinates between lattice centers', () => {
		const geometry = candleGeometry(4, 1.25);
		const a = candleCoordinate(1.37, 3, geometry);
		const b = candleCoordinate(1.37, 4, geometry);
		expect(candleCoordinate(1.37, 3.25, geometry)).toBeCloseTo(a + (b - a) / 4, 10);
	});
});

function fixture() {
	const original = vi.fn(() => [
		{ name: 'rect', attrs: { x: 20, y: 10, width: 1, height: 30 }, styles: { color: 'green' } },
		{ name: 'rect', attrs: { x: 19, y: 20, width: 3, height: 10 }, styles: { style: 'stroke_fill', borderColor: 'green' } },
	]);
	const view = { _createSolidBar: original, _createStrokeBar: original };
	const limits = { barSpaceLimit: { min: 1, max: 50 } };
	const store = {
		_barSpace: 3.6, _totalBarSpace: 800, _lastBarRightSideDiffBarCount: 2, _dataList: [1, 2, 3],
		getBarSpace: () => ({ bar: 3.6, halfBar: 1.8, gapBar: 3, halfGapBar: 1 }),
		setBarSpace(space: number, before?: () => void) { this._barSpace = space; before?.(); },
		dataIndexToCoordinate: (_index: number): number => 0,
		coordinateToFloatIndex: (_x: number): number => 0,
		zoom: vi.fn(), getLayoutOptions: () => limits,
	};
	let previousScale = 1;
	const events = {
		_event: { _startPinchDistance: 100 },
		pinchStartEvent: (_event: { x: number; y: number }) => { previousScale = 1; return true; },
		pinchEvent: (event: { x: number; y: number }, scale: number) => {
			store.zoom((scale - previousScale) * 5, event, 'main');
			previousScale = scale;
			return true;
		},
	};
	const chart = { _chartEvent: events, getChartStore: () => store, getDrawPaneById: () => ({ getMainWidget: () => ({ _candleBarView: view }) }), resize: vi.fn(), zoomAtCoordinate: vi.fn(), destroy: vi.fn() } as unknown as Chart;
	return { original, view, store, chart, events };
}

describe('instance-local discrete zoom bridge', () => {
	it('changes X geometry only, centers wicks, has no parity expansion and isolates instances', () => {
		const { view, store, chart } = fixture();
		const unpatched = fixture();
		installCandleSpacing(chart);
		expect(store.getBarSpace()).toEqual({ bar: 4, halfBar: 2, gapBar: 3, halfGapBar: 1.5 });
		store.setBarSpace(3);
		for (const method of ['_createSolidBar', '_createStrokeBar'] as const) {
			const result = (view[method] as Function)(20, [], store.getBarSpace(), ['green'], 1);
			expect(result).toEqual([
				{ ...unpatched.original()[0], attrs: { x: 19.5, y: 10, width: 1, height: 30 } },
				{ ...unpatched.original()[1], attrs: { x: 19, y: 20, width: 2, height: 10 } },
			]);
		}
		for (const index of [0, 1, 2, 1.25]) expect(store.coordinateToFloatIndex(store.dataIndexToCoordinate(index))).toBeCloseTo(index + 0.5, 10);
		expect(unpatched.store._barSpace).toBe(3.6);
		const once = store.zoom;
		installCandleSpacing(chart);
		expect(store.zoom).toBe(once);
	});
	it('ignores invalid requests without corrupting the store', () => {
		const { chart, store } = fixture();
		installCandleSpacing(chart);
		for (const invalid of [NaN, Infinity, -Infinity, 0, -1]) store.setBarSpace(invalid);
		expect(store._barSpace).toBe(4);
	});
	it.each([100, 137, 240])('accumulates net separation in CSS px from an initial distance of %s', startDistance => {
		const { chart, store, events } = fixture();
		const zoom = store.zoom;
		installCandleSpacing(chart);
		events._event._startPinchDistance = startDistance;
		const point = { x: 200, y: 100 };
		events.pinchStartEvent(point);
		for (const delta of [1, 5, 19, 7, 19.999]) events.pinchEvent(point, (startDistance + delta) / startDistance);
		expect(zoom).not.toHaveBeenCalled();
		events.pinchEvent(point, (startDistance + 20) / startDistance);
		expect(zoom).toHaveBeenCalledTimes(1);
		expect(zoom).toHaveBeenLastCalledWith((6 / 4 - 1) * 10, point, 'main');
		events.pinchEvent(point, (startDistance + 59) / startDistance);
		expect(zoom).toHaveBeenCalledTimes(2);
		events.pinchEvent(point, (startDistance + 60) / startDistance);
		expect(zoom).toHaveBeenCalledTimes(3);
	});
	it('handles multiple steps in one event, reversals, and a fresh gesture', () => {
		const { chart, store, events } = fixture();
		const zoom = store.zoom;
		installCandleSpacing(chart);
		const point = { x: 200, y: 100 };
		events.pinchStartEvent(point);
		events.pinchEvent(point, 1.6); // +60px = three stops from level 2 to 5.
		expect(zoom).toHaveBeenLastCalledWith((8 / 4 - 1) * 10, point, 'main');
		events.pinchEvent(point, 1.41);
		expect(zoom).toHaveBeenCalledTimes(1);
		events.pinchEvent(point, 1.4); // -20px = one stop in reverse.
		expect(zoom).toHaveBeenLastCalledWith((3 / 4 - 1) * 10, point, 'main');
		events.pinchEvent(point, 1.59);
		expect(zoom).toHaveBeenCalledTimes(2);
		events._event._startPinchDistance = 200;
		events.pinchStartEvent(point);
		events.pinchEvent(point, 1.005); // Old 19px residual must be discarded.
		expect(zoom).toHaveBeenCalledTimes(2);
		events.pinchEvent(point, 0.9);
		expect(zoom).toHaveBeenCalledTimes(3);
		store.zoom(0.00001, point, 'main'); // Wheel still takes one stop.
		expect(zoom).toHaveBeenCalledTimes(4);
	});
	it('keeps the same timestamp at exactly the same pixel after history prepend', () => {
		const { chart, store } = fixture();
		installCandleSpacing(chart);
		for (let phase = -100; phase < 100; phase += 0.07) {
			store._lastBarRightSideDiffBarCount = phase;
			store._dataList = Array(320).fill(0);
			const before = store.dataIndexToCoordinate(40);
			store._dataList = Array(420).fill(0);
			expect(store.dataIndexToCoordinate(140)).toBe(before);
		}
	});
	it('fails explicitly if the pinned private boundary changes', () => {
		expect(() => installCandleSpacing({} as Chart)).toThrow(/candle spacing compatibility hook/);
		const { view, chart } = fixture();
		view._createSolidBar = vi.fn(() => []);
		installCandleSpacing(chart);
		expect(() => (view._createSolidBar as Function)(20, [], {}, [], 0)).toThrow(/compatibility hook/);
	});
});
