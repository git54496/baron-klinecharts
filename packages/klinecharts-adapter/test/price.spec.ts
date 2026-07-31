import { describe, expect, it } from 'vitest';

import { normalizePriceValue } from '../src/conversion/price.js';

describe('engine price normalization', () => {
	it('rounds the production KLineCharts value to the Scene symbol precision', () => {
		expect(normalizePriceValue(101.67084494773519, 2, '/overlays/0/anchor/value'))
			.toBe(101.67);
	});

	it.each([
		{ value: 1.005, precision: 2, expected: 1.01 },
		{ value: -1.005, precision: 2, expected: -1.01 },
		{ value: 12.5, precision: 0, expected: 13 },
		{ value: 1.2345678901234567, precision: 16, expected: 1.2345678901234567 },
	])('rounds $value to $precision decimals with half values away from zero', ({
		value,
		precision,
		expected,
	}) => {
		expect(normalizePriceValue(value, precision, '/value')).toBe(expected);
	});

	it('canonicalizes negative zero to positive zero', () => {
		const result = normalizePriceValue(-0.004, 2, '/value');

		expect(result).toBe(0);
		expect(Object.is(result, -0)).toBe(false);
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		'rejects non-finite engine value %s',
		(value) => {
			expect(() => normalizePriceValue(value, 2, '/overlays/0/anchor/value'))
				.toThrowError(expect.objectContaining({
					code: 'EXPORT_INVALID',
					path: '/overlays/0/anchor/value',
				}));
		},
	);

	it.each([-1, 17, 1.5])('rejects invalid Scene price precision %s', (precision) => {
		expect(() => normalizePriceValue(1, precision, '/value'))
			.toThrowError(expect.objectContaining({
				code: 'EXPORT_INVALID',
				path: '/symbol/pricePrecision',
			}));
	});
});
