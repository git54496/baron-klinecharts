import { describe, expect, it } from 'vitest';

import { normalizeDecimalValue } from '../src/index.js';

describe('decimal normalization core', () => {
	it.each([
		{ value: 1.005, precision: 2, expected: 1.01 },
		{ value: -1.005, precision: 2, expected: -1.01 },
		{ value: 12.5, precision: 0, expected: 13 },
		{ value: -12.5, precision: 0, expected: -13 },
		{ value: 2.675, precision: 2, expected: 2.68 },
		{ value: -2.675, precision: 2, expected: -2.68 },
		{ value: 1.2345678901234567, precision: 16, expected: 1.2345678901234567 },
		{ value: 0.00000000000000005, precision: 16, expected: 0.0000000000000001 },
		{ value: 123456789.123456789, precision: 6, expected: 123456789.123457 },
	])('rounds $value to $precision with ties away from zero', ({ value, precision, expected }) => {
		expect(normalizeDecimalValue(value, precision)).toBe(expected);
	});

	it('canonicalizes negative zero to positive zero', () => {
		expect(normalizeDecimalValue(-0.0004, 3)).toBe(0);
		expect(Object.is(normalizeDecimalValue(-0.0004, 3), -0)).toBe(false);
		expect(normalizeDecimalValue(0, 2)).toBe(0);
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		'rejects non-finite value %s',
		(value) => {
			expect(() => normalizeDecimalValue(value, 2)).toThrow(RangeError);
		},
	);

	it.each([-1, 17, 1.5])('rejects invalid precision %s', (precision) => {
		expect(() => normalizeDecimalValue(1, precision)).toThrow(RangeError);
	});

});
