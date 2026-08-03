import type { TimeSeriesDefinition } from '@baron1996/kline-scene-schema';
import type {
	IndicatorCreate,
	IndicatorTemplate,
	KLineData,
} from 'klinecharts';

export const TIME_SERIES_INDICATOR_NAME = 'BARON_TIME_SERIES_LINE';
export const TIME_SERIES_PANE_ID = 'baron_time_series_pane';
export const TIME_SERIES_Y_AXIS_ID = 'baron_time_series_y_axis';

interface TimeSeriesCarrierData extends KLineData {
	readonly __baronTimeSeriesValues: Readonly<Record<string, number | null>>;
}

interface TimeSeriesIndicatorResult {
	readonly value: number | null;
}

interface TimeSeriesIndicatorExtendData {
	readonly seriesId: string;
}

function lineStyle(style: TimeSeriesDefinition['style']) {
	return {
		color: style.color,
		size: style.size,
		style: style.style === 'solid' ? 'solid' as const : 'dashed' as const,
		dashedValue: style.style === 'dotted' ? [1, 2] : [4, 4],
		smooth: false,
	};
}

export const timeSeriesIndicatorTemplate: IndicatorTemplate<
	TimeSeriesIndicatorResult,
	never,
	TimeSeriesIndicatorExtendData
> = {
	name: TIME_SERIES_INDICATOR_NAME,
	shortName: '',
	series: 'normal',
	shouldOhlc: false,
	shouldFormatBigNumber: false,
	figures: [{ key: 'value', type: 'line' }],
	shouldUpdate(previous, current) {
		const shouldCalculate =
			previous.extendData.seriesId !== current.extendData.seriesId ||
			previous.visible !== current.visible;
		return {
			calc: shouldCalculate,
			draw: shouldCalculate || previous.visible !== current.visible,
		};
	},
	calc(dataList, indicator): TimeSeriesIndicatorResult[] {
		if (!indicator.visible) {
			return dataList.map(() => ({ value: null }));
		}
		const seriesId = indicator.extendData.seriesId;
		return dataList.map((bar) => {
			const values = (bar as TimeSeriesCarrierData).__baronTimeSeriesValues;
			return { value: values[seriesId] ?? null };
		});
	},
};

export function toTimeSeriesIndicatorCreate(
	series: TimeSeriesDefinition,
): IndicatorCreate {
	return {
		id: `baron_time_series_${series.id}`,
		name: TIME_SERIES_INDICATOR_NAME,
		shortName: series.name,
		paneId: TIME_SERIES_PANE_ID,
		yAxisId: TIME_SERIES_Y_AXIS_ID,
		precision: series.precision,
		visible: series.visible,
		zLevel: 0,
		extendData: { seriesId: series.id },
		styles: {
			lines: [lineStyle(series.style)],
			lastValueMark: { show: false },
			tooltip: { showRule: 'none' },
		},
	};
}
