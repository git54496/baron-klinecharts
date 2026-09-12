import { describe, expect, it } from 'vitest';

import { turnoverIndicator } from '../src/extensions/turnover.js';

describe('TURNOVER indicator', () => {
	it('plots the source turnover and leaves missing values empty', () => {
		const result = turnoverIndicator.calc([
			{ timestamp: 1, open: 10, high: 12, low: 9, close: 11, turnover: 1_250_000 },
			{ timestamp: 2, open: 11, high: 12, low: 10, close: 10 },
		], {} as never);
		expect(result.map((bar) => bar.turnover)).toEqual([1_250_000, null]);
		expect(result.map((bar) => [bar.open, bar.close])).toEqual([[10, 11], [11, 10]]);
	});
});
