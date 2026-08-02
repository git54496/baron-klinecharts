import type { registerOverlay } from 'klinecharts';
import { SceneError } from '@baron1996/kline-scene-schema';

type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];

function signedFixed(value: number, precision: number): string {
	const prefix = value > 0 ? '+' : '';
	return `${prefix}${value.toFixed(precision)}`;
}

export interface PriceMeasurementDisplay {
	readonly absoluteChange: number;
	readonly percentageChange: number;
	readonly label: string;
}

/** 仅派生显示值；绝对变化、百分比和 label 永不写入 Scene。 */
export function derivePriceMeasurementDisplay(
	startValue: number,
	endValue: number,
	pricePrecision: number,
): PriceMeasurementDisplay {
	if (
		!Number.isFinite(startValue) ||
		!Number.isFinite(endValue) ||
		startValue <= 0 ||
		!Number.isInteger(pricePrecision) ||
		pricePrecision < 0 ||
		pricePrecision > 16
	) {
		throw new SceneError(
			'SCENE_SCHEMA_INVALID',
			'/overlays/priceMeasurement',
			'Price measurement display inputs must be positive finite prices and a 0..16 precision.',
		);
	}
	const absoluteChange = endValue - startValue;
	const percentageChange = absoluteChange / startValue * 100;
	return {
		absoluteChange,
		percentageChange,
		label: `${signedFixed(absoluteChange, pricePrecision)} (${signedFixed(percentageChange, 2)}%)`,
	};
}

/** 量度工具只从两个引擎数据点派生显示文字，派生值不进入 Scene。 */
export const priceMeasurementOverlay: KLineOverlayTemplate = {
	name: 'priceMeasurement',
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ chart, coordinates, overlay }) => {
		const startCoordinate = coordinates[0];
		const endCoordinate = coordinates[1];
		const startPoint = overlay.points[0];
		const endPoint = overlay.points[1];
		if (
			startCoordinate === undefined ||
			endCoordinate === undefined ||
			startPoint?.value === undefined ||
			endPoint?.value === undefined
		) {
			return [];
		}
		const pricePrecision = chart.getSymbol()?.pricePrecision ?? 0;
		const { label } = derivePriceMeasurementDisplay(
			startPoint.value,
			endPoint.value,
			pricePrecision,
		);
		return [
			{
				key: 'measurement-body',
				type: 'line',
				attrs: { coordinates: [startCoordinate, endCoordinate] },
			},
			{
				key: 'measurement-label',
				type: 'text',
				attrs: {
					x: (startCoordinate.x + endCoordinate.x) / 2 + 8,
					y: (startCoordinate.y + endCoordinate.y) / 2 - 8,
					text: label,
					align: 'left',
					baseline: 'bottom',
				},
				ignoreEvent: true,
			},
		];
	},
};
