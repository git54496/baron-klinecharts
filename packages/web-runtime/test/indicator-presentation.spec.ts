import { describe, expect, it } from 'vitest';

import { MAIN_PANE_INDICATOR_PRESETS, defaultIndicatorStyles } from '../src/indicator-presentation.js';

describe('default indicator styles', () => {
	it('uses the reference MA periods, colors, and widths for new indicators', () => {
		const preset = MAIN_PANE_INDICATOR_PRESETS.find((item) => item.name === 'MA');
		expect(preset?.calcParams).toEqual([5, 20, 50, 200]);
		expect(defaultIndicatorStyles('MA', preset!.calcParams).lines).toEqual([
			{ color: 'rgba(160, 170, 198, 1)', size: 1, style: 'solid' },
			{ color: 'rgba(220, 173, 92, 1)', size: 1, style: 'solid' },
			{ color: 'rgba(16, 185, 130, 1)', size: 1.5, style: 'solid' },
			{ color: 'rgba(239, 68, 68, 1)', size: 2, style: 'solid' },
		]);
	});
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
