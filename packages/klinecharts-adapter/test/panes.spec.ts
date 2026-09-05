import { describe, expect, it } from 'vitest';

import { formatDefaultPriceAxisValue } from '../src/conversion/panes.js';

describe('default candle price axis presentation', () => {
	it.each([
		{ value: 442.706380952, expected: '442.71' },
		{ value: 438.95, expected: '438.95' },
		{ value: 12, expected: '12.00' },
		{ value: -0.001, expected: '0.00' },
	])('keeps two decimals for $value', ({ value, expected }) => {
		expect(formatDefaultPriceAxisValue(value)).toBe(expected);
	});
});
