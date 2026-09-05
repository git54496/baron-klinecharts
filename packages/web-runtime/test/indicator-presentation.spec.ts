import { describe, expect, it } from 'vitest';

import { defaultIndicatorStyles } from '../src/indicator-presentation.js';

describe('default indicator styles', () => {
	it('provides a drawable circle style for SAR', () => {
		expect(defaultIndicatorStyles('SAR', [2, 2, 20]).circles).toEqual([
			{
				color: 'rgba(41, 98, 255, 1)',
				radius: 2,
			},
		]);
	});

	it('does not add circle styles to line-only indicators', () => {
		expect(defaultIndicatorStyles('MA', [5, 10, 30, 60]).circles).toEqual([]);
	});
});
