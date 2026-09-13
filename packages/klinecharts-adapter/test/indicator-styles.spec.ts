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

	it('renders a hidden indicator line transparently while preserving its configured color', () => {
		const style = { color: 'rgba(41, 98, 255, 1)', size: 2, style: 'solid' as const, visible: false };
		const converted = toKLineChartsIndicatorStyles({ lines: [style], bars: [], circles: [] });
		expect(converted.lines?.[0]?.color).toBe('rgba(0, 0, 0, 0)');
		expect(style.color).toBe('rgba(41, 98, 255, 1)');
	});
});
