import { describe, expect, it } from 'vitest';
import type { AxisRange } from 'klinecharts';
import { translatePanRange } from '../src/engine-pan.js';

function logarithmicRange(from: number, to: number): AxisRange {
	return {
		from, to, range: to - from,
		realFrom: Math.log10(from), realTo: Math.log10(to), realRange: Math.log10(to) - Math.log10(from),
		displayFrom: from, displayTo: to, displayRange: to - from,
	};
}

const logarithmicAxis = {
	name: 'logarithm', reverse: false,
	// The pinned engine's signed inverse has to be bypassed for positive sub-unit prices.
	realValueToValue: (value: number) => value < 0 ? -(10 ** Math.abs(value)) : 10 ** value,
	realValueToDisplayValue: (value: number) => value < 0 ? -(10 ** Math.abs(value)) : 10 ** value,
};

describe('scale-preserving price-axis pan', () => {
	it.each([[100, 1000], [0.01, 0.1], [0.1, 10]])('keeps positive log ratios for %s..%s', (from, to) => {
		const start = logarithmicRange(from, to);
		const result = translatePanRange(logarithmicAxis, start, 120, 600)!;
		expect(result.from).toBeGreaterThan(0);
		expect(result.to / result.from).toBeCloseTo(to / from, 10);
		expect(result.realRange).toBe(start.realRange);
		expect(result.from / from).toBeCloseTo(result.to / to, 10);
		expect(result.realFrom - start.realFrom).toBeCloseTo(start.realRange * 0.2, 10);
	});
	it('reverses drag direction for reversed axes', () => {
		const start = logarithmicRange(100, 1000);
		const reversed = translatePanRange({ ...logarithmicAxis, reverse: true }, start, 120, 600)!;
		const upward = translatePanRange(logarithmicAxis, start, -120, 600)!;
		expect(reversed).toEqual(upward);
	});
	it('rejects unrepresentable ranges instead of corrupting the viewport', () => {
		const start = logarithmicRange(100, 1000);
		for (const delta of [Infinity, NaN, 1e9, -1e9]) {
			expect(translatePanRange(logarithmicAxis, start, delta, 600)).toBeNull();
		}
		expect(translatePanRange(logarithmicAxis, start, 100, 0)).toBeNull();
	});
});
