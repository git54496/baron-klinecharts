import { describe, expect, it } from 'vitest';
import type { AxisCreateTicksParams } from 'klinecharts';
import { createLogPriceTicks } from '../src/conversion/log-price-ticks.js';

function params(from: number, to: number, height = 600): AxisCreateTicksParams {
	const realFrom = Math.log10(from), realTo = Math.log10(to);
	return {
		range: { from, to, range: to - from, realFrom, realTo, realRange: realTo - realFrom,
			displayFrom: from, displayTo: to, displayRange: to - from },
		bounding: { height, width: 60, left: 0, right: 60, top: 0, bottom: height },
		defaultTicks: [],
	};
}

describe('logarithmic price ticks', () => {
	it('honors text formatting and larger axis fonts', () => {
		const small = createLogPriceTicks(params(60, 480), false);
		const large = createLogPriceTicks(params(60, 480), false, { textHeight: 32, formatText: (text) => `$${text}` });
		expect(large.length).toBeLessThan(small.length);
		for (let index = 0; index < large.length; index++) {
			expect(large[index]!.text).toMatch(/^\$/);
			if (index > 0) expect(large[index - 1]!.coord - large[index]!.coord).toBeGreaterThanOrEqual(96);
		}
	});
	it.each([[60, 480], [0.01, 0.1], [0.1, 10], [0.000001, 0.00001]])('uses equal ratios and readable unique labels for %s..%s', (from, to) => {
		const ticks = createLogPriceTicks(params(from, to), false);
		expect(ticks.length).toBeGreaterThan(3);
		expect(new Set(ticks.map((tick) => tick.text)).size).toBe(ticks.length);
		const ratio = Number(ticks[1]!.value) / Number(ticks[0]!.value);
		const spacing = ticks[0]!.coord - ticks[1]!.coord;
		for (let i = 1; i < ticks.length; i++) {
			expect(Number(ticks[i]!.value) / Number(ticks[i - 1]!.value)).toBeCloseTo(ratio, 10);
			expect(Math.abs(ticks[i - 1]!.coord - ticks[i]!.coord - spacing)).toBeLessThanOrEqual(1);
			expect(Number(ticks[i]!.text)).toBeGreaterThan(0);
		}
	});
	it.each([false, true])('keeps tick identities through repeated pans reverse=%s', (reverse) => {
		const initial = params(60, 480);
		const ticks = createLogPriceTicks(initial, reverse);
		for (const dy of [1, 60, 120, -60, 0]) {
			const shift = dy / 600 * initial.range.realRange * (reverse ? -1 : 1);
			const moved = createLogPriceTicks(params(60 * 10 ** shift, 480 * 10 ** shift), reverse);
			const common = ticks.filter((tick) => moved.some((next) => next.value === tick.value));
			expect(common.length).toBeGreaterThan(3);
			for (const tick of common) {
				const next = moved.find((next) => next.value === tick.value)!;
				expect(next.text).toBe(tick.text);
				expect(Math.abs(next.coord - tick.coord - dy)).toBeLessThanOrEqual(1);
			}
		}
	});
	it('adapts density to zoom and height without floating-point threshold jitter', () => {
		const normal = createLogPriceTicks(params(1, 10 ** 1.25), false);
		const perturbed = createLogPriceTicks(params(1, 10 ** (1.25 + 1e-14)), false);
		expect(perturbed.map((tick) => tick.value)).toEqual(normal.map((tick) => tick.value));
		const zoomed = createLogPriceTicks(params(1, 10 ** 0.5), false);
		const taller = createLogPriceTicks(params(1, 10 ** 1.25, 1200), false);
		const ratio = (ticks: typeof normal) => Number(ticks[1]!.value) / Number(ticks[0]!.value);
		expect(ratio(zoomed)).toBeLessThan(ratio(normal));
		expect(ratio(taller)).toBeLessThan(ratio(normal));
	});
});
