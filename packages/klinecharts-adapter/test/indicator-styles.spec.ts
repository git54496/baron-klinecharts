import { describe, expect, it } from 'vitest';

import { toKLineChartsIndicatorStyles } from '../src/conversion/indicators.js';

describe('indicator style conversion', () => {
	it('keeps engine defaults when a Scene style channel is empty', () => {
		expect(toKLineChartsIndicatorStyles({ lines: [], bars: [], circles: [] }))
			.toEqual({});
	});

	it('maps configured circle styles to the engine color fields', () => {
		expect(toKLineChartsIndicatorStyles({
			lines: [],
			bars: [],
			circles: [{ color: 'rgba(41, 98, 255, 1)', radius: 2 }],
		})).toEqual({
			circles: [
				{
					style: 'fill',
					upColor: 'rgba(41, 98, 255, 1)',
					downColor: 'rgba(41, 98, 255, 1)',
					noChangeColor: 'rgba(41, 98, 255, 1)',
					borderRadius: 2,
				},
			],
		});
	});
});
