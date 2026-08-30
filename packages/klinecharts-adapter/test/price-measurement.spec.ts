import { describe, expect, it } from 'vitest';

import {
	derivePriceMeasurementDisplay,
	priceMeasurementOverlay,
} from '../src/extensions/price-measurement.js';

function chartStub(pricePrecision: number) {
	return {
		getSymbol: () => ({ pricePrecision }),
		getStyles: () => ({
			candle: {
				bar: {
					upColor: 'rgba(239, 83, 80, 1)',
					downColor: 'rgba(38, 166, 154, 1)',
				},
			},
		}),
	};
}

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

	it('draws the measured range as a filled rectangle with a centered label', () => {
		const overlay = {
			points: [
				{ value: 100 },
				{ value: 112.5 },
			],
			styles: {},
		};
		const figures = priceMeasurementOverlay.createPointFigures?.({
			chart: chartStub(2),
			coordinates: [
				{ x: 24, y: 96 },
				{ x: 144, y: 36 },
			],
			overlay,
		} as never);

		expect(overlay.styles).toMatchObject({
			point: {
				color: 'rgba(239, 83, 80, 1)',
				borderColor: 'rgba(239, 83, 80, 1)',
				activeColor: 'rgba(239, 83, 80, 1)',
				activeBorderColor: 'rgba(239, 83, 80, 1)',
			},
			rect: {
				color: 'rgba(239, 83, 80, 0.15)',
				borderColor: 'rgba(239, 83, 80, 1)',
			},
			text: {
				backgroundColor: 'rgba(239, 83, 80, 1)',
				borderColor: 'rgba(239, 83, 80, 1)',
			},
		});

		expect(figures).toEqual([
			{
				key: 'measurement-range',
				type: 'rect',
				attrs: { x: 24, y: 36, width: 120, height: 60 },
				styles: {
					color: 'rgba(239, 83, 80, 0.15)',
					borderColor: 'rgba(239, 83, 80, 1)',
				},
			},
			{
				key: 'measurement-label',
				type: 'text',
				attrs: {
					x: 84,
					y: 66,
					text: '+12.50 (+12.50%)',
					align: 'center',
					baseline: 'middle',
				},
				styles: {
					backgroundColor: 'rgba(239, 83, 80, 1)',
					borderColor: 'rgba(239, 83, 80, 1)',
				},
				ignoreEvent: true,
			},
		]);
	});

	it('normalizes reverse drag coordinates into the same rectangle bounds', () => {
		const overlay = {
			points: [
				{ value: 112.5 },
				{ value: 100 },
			],
			styles: {},
		};
		const figures = priceMeasurementOverlay.createPointFigures?.({
			chart: chartStub(1),
			coordinates: [
				{ x: 144, y: 36 },
				{ x: 24, y: 96 },
			],
			overlay,
		} as never) as Array<{
			readonly attrs: Record<string, unknown>;
			readonly styles?: Record<string, unknown>;
		}>;

		expect(figures[0]?.attrs).toEqual({ x: 24, y: 36, width: 120, height: 60 });
		expect(figures[0]?.styles).toEqual({
			color: 'rgba(38, 166, 154, 0.15)',
			borderColor: 'rgba(38, 166, 154, 1)',
		});
		expect(figures[1]?.attrs).toMatchObject({
			x: 84,
			y: 66,
			text: '-12.5 (-11.11%)',
		});
		expect(figures[1]?.styles).toEqual({
			backgroundColor: 'rgba(38, 166, 154, 1)',
			borderColor: 'rgba(38, 166, 154, 1)',
		});
		expect(overlay.styles).toMatchObject({
			point: {
				color: 'rgba(38, 166, 154, 1)',
				borderColor: 'rgba(38, 166, 154, 1)',
			},
			rect: {
				color: 'rgba(38, 166, 154, 0.15)',
				borderColor: 'rgba(38, 166, 154, 1)',
			},
			text: {
				backgroundColor: 'rgba(38, 166, 154, 1)',
				borderColor: 'rgba(38, 166, 154, 1)',
			},
		});
	});
});
