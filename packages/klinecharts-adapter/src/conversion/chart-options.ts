import type { ChartConfig } from '@baron1996/kline-scene-schema';
import type {
	DeepPartial,
	FormatDateParams,
	Options,
	Styles,
} from 'klinecharts';

function formatDate({ dateTimeFormat, timestamp }: FormatDateParams, template: ChartConfig['dateFormat']): string {
	const parts = new Map(
		dateTimeFormat
			.formatToParts(timestamp)
			.filter((part) => part.type !== 'literal')
			.map((part) => [part.type, part.value]),
	);
	const date = `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`;
	if (template === 'yyyy-MM-dd') {
		return date;
	}
	const time = `${parts.get('hour')}:${parts.get('minute')}`;
	if (template === 'yyyy-MM-dd HH:mm') {
		return `${date} ${time}`;
	}
	return `${date} ${time}:${parts.get('second')}`;
}

function compact(value: string | number, divisor: number, suffix: string): string {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return String(value);
	}
	return `${Number((numeric / divisor).toFixed(3))}${suffix}`;
}

function formatLargeNumber(
	value: string | number,
	mode: ChartConfig['largeNumberFormat'],
): string {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || mode === 'plain') {
		return String(value);
	}
	const absolute = Math.abs(numeric);
	if (mode === 'chinese') {
		if (absolute >= 100_000_000) {
			return compact(value, 100_000_000, '亿');
		}
		if (absolute >= 10_000) {
			return compact(value, 10_000, '万');
		}
		return String(value);
	}
	if (absolute >= 1_000_000_000) {
		return compact(value, 1_000_000_000, 'B');
	}
	if (absolute >= 1_000_000) {
		return compact(value, 1_000_000, 'M');
	}
	if (absolute >= 1_000) {
		return compact(value, 1_000, 'K');
	}
	return String(value);
}

function chartStyles(chart: ChartConfig): DeepPartial<Styles> {
	const text = {
		color: chart.layout.textColor,
		size: chart.layout.fontSize,
		family: chart.layout.fontFamily,
	};
	return {
		grid: {
			horizontal: {
				show: true,
				color: chart.grid.horizontalColor,
			},
			vertical: {
				show: true,
				color: chart.grid.verticalColor,
			},
		},
		candle: {
			type: chart.candle.type,
			bar: {
				upColor: chart.candle.upColor,
				downColor: chart.candle.downColor,
				noChangeColor: chart.candle.noChangeColor,
				upBorderColor: chart.candle.upBorderColor,
				downBorderColor: chart.candle.downBorderColor,
				noChangeBorderColor: chart.candle.noChangeBorderColor,
				upWickColor: chart.candle.upWickColor,
				downWickColor: chart.candle.downWickColor,
				noChangeWickColor: chart.candle.noChangeWickColor,
			},
			area: {
				point: {
					animation: false,
				},
			},
		},
		xAxis: { tickText: text },
		yAxis: { tickText: text },
	};
}

/** 将纯数据 ChartConfig 转换为受控的 KLineCharts 初始化选项。 */
export function toKLineChartsOptions(chart: ChartConfig): Options {
	return {
		locale: chart.locale,
		timezone: chart.timezone,
		styles: chartStyles(chart),
		formatter: {
			formatDate: (params) => formatDate(params, chart.dateFormat),
			formatBigNumber: (value) => formatLargeNumber(value, chart.largeNumberFormat),
		},
		thousandsSeparator: {
			sign: chart.thousandsSeparator,
		},
		decimalFold: {
			threshold: chart.decimalFold.threshold,
			format: chart.decimalFold.enabled
				? (value) => {
						const source = String(value);
						const expression = new RegExp(`\\.0{${chart.decimalFold.threshold},}[1-9][0-9]*$`);
						if (!expression.test(source)) {
							return source;
						}
						const [integer, decimal = ''] = source.split('.');
						const zeroCount = decimal.match(/^0*/)?.[0].length ?? 0;
						return `${integer}.0{${zeroCount}}${decimal.slice(zeroCount)}`;
					}
				: (value) => String(value),
		},
		zoomAnchor: chart.zoomAnchor === 'right' ? 'last_bar' : 'cursor',
		hotkey: {
			enabled: false,
			exclude: [],
		},
	};
}
