import type { registerOverlay } from 'klinecharts';
import { SceneError } from '@baron1996/kline-scene-schema';

type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];

const MEASUREMENT_FILL_OPACITY = 0.15;

function withOpacity(color: string, opacity: number): string {
	const rgb = color.match(
		/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
	);
	if (rgb !== null) {
		return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${opacity})`;
	}

	const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
	if (hex !== undefined) {
		const normalized = hex.length === 3
			? [...hex].map((value) => `${value}${value}`).join('')
			: hex;
		return `rgba(${Number.parseInt(normalized.slice(0, 2), 16)}, ${Number.parseInt(normalized.slice(2, 4), 16)}, ${Number.parseInt(normalized.slice(4, 6), 16)}, ${opacity})`;
	}

	return color;
}

function signedFixed(value: number, precision: number): string {
	const prefix = value > 0 ? '+' : '';
	return `${prefix}${value.toFixed(precision)}`;
}

export interface PriceMeasurementDisplay {
	readonly absoluteChange: number;
	readonly percentageChange: number | null;
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
		!Number.isInteger(pricePrecision) ||
		pricePrecision < 0 ||
		pricePrecision > 16
	) {
		throw new SceneError(
			'SCENE_SCHEMA_INVALID',
			'/overlays/priceMeasurement',
			'Price measurement display inputs must be finite numbers and a 0..16 precision.',
		);
	}
	const absoluteChange = endValue - startValue;
	if (startValue === 0) {
		return {
			absoluteChange,
			percentageChange: null,
			label: `${signedFixed(absoluteChange, pricePrecision)} (—%)`,
		};
	}
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
		const { absoluteChange, label } = derivePriceMeasurementDisplay(
			startPoint.value,
			endPoint.value,
			pricePrecision,
		);
		const candleColors = chart.getStyles().candle.bar;
		const measurementColor = absoluteChange > 0
			? candleColors.upColor
			: candleColors.downColor;
		const measurementFill = withOpacity(
			measurementColor,
			MEASUREMENT_FILL_OPACITY,
		);
		// 默认端点和坐标轴投影也读取 Overlay styles；这里只修改引擎显示样式，
		// Scene 导出仍使用 source styles，因此涨跌色不会被持久化为用户样式。
		overlay.styles = {
			...overlay.styles,
			point: {
				...overlay.styles?.point,
				color: measurementColor,
				borderColor: measurementColor,
				activeColor: measurementColor,
				activeBorderColor: measurementColor,
			},
			rect: {
				...overlay.styles?.rect,
				color: measurementFill,
				borderColor: measurementColor,
			},
			text: {
				...overlay.styles?.text,
				backgroundColor: measurementColor,
				borderColor: measurementColor,
			},
		};
		const left = Math.min(startCoordinate.x, endCoordinate.x);
		const top = Math.min(startCoordinate.y, endCoordinate.y);
		const width = Math.abs(endCoordinate.x - startCoordinate.x);
		const height = Math.abs(endCoordinate.y - startCoordinate.y);
		return [
			{
				key: 'measurement-range',
				type: 'rect',
				attrs: { x: left, y: top, width, height },
				styles: {
					color: measurementFill,
					borderColor: measurementColor,
				},
			},
			{
				key: 'measurement-label',
				type: 'text',
				attrs: {
					x: left + width / 2,
					y: top + height / 2,
					text: label,
					align: 'center',
					baseline: 'middle',
				},
				styles: {
					backgroundColor: measurementColor,
					borderColor: measurementColor,
				},
				ignoreEvent: true,
			},
		];
	},
};
