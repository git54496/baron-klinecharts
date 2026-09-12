import type { IndicatorTemplate, KLineData } from 'klinecharts';

interface TurnoverResult {
	turnover: number | null;
	open: number;
	close: number;
}

/** 成交额直接来自行情 turnover 字段；缺失数据保持为空。 */
export const turnoverIndicator: IndicatorTemplate<TurnoverResult, never> = {
	name: 'TURNOVER',
	shortName: 'AMOUNT',
	series: 'volume',
	shouldFormatBigNumber: true,
	minValue: 0,
	figures: [{
		key: 'turnover',
		title: 'AMOUNT: ',
		type: 'bar',
		baseValue: 0,
		styles({ data, indicator, defaultStyles }) {
			const current = data.current;
			const bar = indicator.styles?.bars?.[0];
			const defaults = defaultStyles?.bars?.[0];
			const color = current && current.close > current.open
				? bar?.upColor ?? defaults?.upColor
				: current && current.close < current.open
					? bar?.downColor ?? defaults?.downColor
					: bar?.noChangeColor ?? defaults?.noChangeColor;
			return color === undefined ? null : { color };
		},
	}],
	calc(dataList: KLineData[]) {
		return dataList.map((bar) => ({
			turnover: bar.turnover ?? null,
			open: bar.open,
			close: bar.close,
		}));
	},
};
