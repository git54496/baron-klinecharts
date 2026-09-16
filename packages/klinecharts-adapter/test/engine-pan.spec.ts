import { describe, expect, it } from 'vitest';
import type { AxisRange } from 'klinecharts';
import { signedLogPrice, signedLogValue } from '../src/conversion/log-price-ticks.js';
import { translatePanRange } from '../src/engine-pan.js';

function logarithmicRange(from: number, to: number): AxisRange {
	return {
		from, to, range: to - from,
		realFrom: signedLogValue(from), realTo: signedLogValue(to), realRange: signedLogValue(to) - signedLogValue(from),
		displayFrom: from, displayTo: to, displayRange: to - from,
	};
}

const logarithmicAxis = {
	name: 'logarithm', reverse: false,
	realValueToValue: (value: number) => signedLogPrice(value),
	realValueToDisplayValue: (value: number) => signedLogPrice(value),
};

describe('scale-preserving price-axis pan', () => {
	it.each([[100, 1000], [0.01, 0.1], [0.1, 10], [-10, 10], [-1000, -100]])('keeps symmetric-log spans for %s..%s', (from, to) => {
		const start = logarithmicRange(from, to);
		const result = translatePanRange(logarithmicAxis, start, 120, 600)!;
		expect(result.realRange).toBe(start.realRange);
		expect(result.realFrom - start.realFrom).toBeCloseTo(start.realRange * 0.2, 10);
		expect(signedLogValue(result.from)).toBeCloseTo(result.realFrom, 10);
		expect(signedLogValue(result.to)).toBeCloseTo(result.realTo, 10);
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
