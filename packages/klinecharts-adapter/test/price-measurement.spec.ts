import { describe, expect, it } from 'vitest';

import {
	derivePriceMeasurementDisplay,
	priceMeasurementOverlay,
} from '../src/extensions/price-measurement.js';

describe('priceMeasurement derived display', () => {
	it('keeps the engine three-step template required for two persisted anchors', () => {
		expect(priceMeasurementOverlay.totalStep).toBe(3);
	});

	it('derives AAPL 300 to 330 without persisting display fields', () => {
		expect(derivePriceMeasurementDisplay(300, 330, 3)).toEqual({
			absoluteChange: 30,
			percentageChange: 10,
			label: '+30.000 (+10.00%)',
		});
	});

	it('uses the start price denominator for a negative move', () => {
		const display = derivePriceMeasurementDisplay(330, 300, 2);
		expect(display.absoluteChange).toBe(-30);
		expect(display.percentageChange).toBeCloseTo(-9.0909090909, 10);
		expect(display.label).toBe('-30.00 (-9.09%)');
	});

	it('shows only absolute change with an em dash percentage for a zero start', () => {
		expect(derivePriceMeasurementDisplay(0, 330, 2)).toEqual({
			absoluteChange: 330,
			percentageChange: null,
			label: '+330.00 (—%)',
		});
	});

	it.each([
		[Number.NaN, 330, 2],
		[300, Number.POSITIVE_INFINITY, 2],
		[300, 330, 17],
	] as const)('rejects invalid display inputs %#', (start, end, precision) => {
		expect(() => derivePriceMeasurementDisplay(start, end, precision))
			.toThrowError(expect.objectContaining({ code: 'SCENE_SCHEMA_INVALID' }));
	});
});
