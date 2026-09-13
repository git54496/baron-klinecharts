import type {
	SceneIndicator,
	ScenePane,
} from '@baron1996/kline-scene-schema';
import { SceneError } from '@baron1996/kline-scene-schema';
import type {
	Chart,
	DeepPartial,
	IndicatorCreate,
	IndicatorStyle,
	IndicatorTooltipData,
	TooltipFeatureStyle,
} from 'klinecharts';

import type { EngineIdMap } from './id-map.js';
import { requireMappedId } from './id-map.js';
import { isSupportedIndicator } from '../registry/indicators.js';

export const INDICATOR_SETTINGS_FEATURE_ID = 'baron-indicator-settings';

const INDICATOR_SETTINGS_FEATURE: TooltipFeatureStyle = {
	id: INDICATOR_SETTINGS_FEATURE_ID,
	position: 'middle',
	type: 'path',
	content: {
		path: 'M7 1 L9 1 L9.4 2.4 L10.6 2.9 L11.9 2.2 L13.4 3.7 L12.7 5 L13.2 6.2 L14.6 6.6 L14.6 8.6 L13.2 9 L12.7 10.2 L13.4 11.5 L11.9 13 L10.6 12.3 L9.4 12.8 L9 14.2 L7 14.2 L6.6 12.8 L5.4 12.3 L4.1 13 L2.6 11.5 L3.3 10.2 L2.8 9 L1.4 8.6 L1.4 6.6 L2.8 6.2 L3.3 5 L2.6 3.7 L4.1 2.2 L5.4 2.9 L6.6 2.4 Z M10.4 7.6 C10.4 8.93 9.33 10 8 10 C6.67 10 5.6 8.93 5.6 7.6 C5.6 6.27 6.67 5.2 8 5.2 C9.33 5.2 10.4 6.27 10.4 7.6 Z',
		style: 'stroke',
		lineWidth: 1.3,
	},
	size: 16,
	color: '#68707a',
	activeColor: '#0b6df2',
	backgroundColor: 'transparent',
	activeBackgroundColor: '#f1f5fb',
	borderRadius: 4,
	marginLeft: 2,
	marginRight: 5,
	marginTop: 0,
	marginBottom: 0,
	paddingLeft: 3,
	paddingRight: 3,
	paddingTop: 3,
	paddingBottom: 3,
};

function lineStyle(style: SceneIndicator['styles']['lines'][number]) {
	return {
		color: style.color,
		size: style.size,
		style: style.style === 'solid' ? 'solid' as const : 'dashed' as const,
		dashedValue: style.style === 'dotted' ? [1, 2] : [4, 4],
		smooth: false,
	};
}

/**
 * 将协议内指标样式映射为 KLineCharts 的受控样式子集。
 * 空样式通道必须省略，让引擎保留可用的默认项，避免圆点等图形按空数组取样。
 */
export function toKLineChartsIndicatorStyles(
	styles: SceneIndicator['styles'],
): DeepPartial<IndicatorStyle> {
	const converted: DeepPartial<IndicatorStyle> = {};
	if (styles.lines.length > 0) {
		converted.lines = styles.lines.map(lineStyle);
	}
	if (styles.bars.length > 0) {
		converted.bars = styles.bars.map((style) => ({
			style: 'fill',
			upColor: style.upColor,
			downColor: style.downColor,
			noChangeColor: style.noChangeColor,
		}));
	}
	if (styles.circles.length > 0) {
		converted.circles = styles.circles.map((style) => ({
			style: 'fill',
			upColor: style.color,
			downColor: style.color,
			noChangeColor: style.color,
			borderRadius: style.radius,
		}));
	}
	return converted;
}

export function toIndicatorCreate(
	indicator: SceneIndicator,
	idMap: EngineIdMap,
	path: string,
): IndicatorCreate {
	if (!isSupportedIndicator(indicator.name)) {
		throw new SceneError('UNKNOWN_INDICATOR', `${path}/name`, `Unsupported Indicator: ${indicator.name}`);
	}
	return {
		id: indicator.id,
		name: indicator.name,
		paneId: requireMappedId(idMap.paneToEngine, indicator.paneId, `${path}/paneId`, 'Pane'),
		yAxisId: requireMappedId(idMap.yAxisToEngine, indicator.yAxisId, `${path}/yAxisId`, 'Y-axis'),
		calcParams: [...indicator.calcParams],
		precision: indicator.precision,
		visible: indicator.visible,
		zLevel: indicator.zLevel,
		styles: toKLineChartsIndicatorStyles(indicator.styles),
		// KLineCharts keeps its default title and value legends when the callback only
		// supplies features. The middle position follows each indicator title.
		createTooltipDataSource: ({ indicator: current }) => ({
			features: current.calcParams.length > 0 ? [INDICATOR_SETTINGS_FEATURE] : [],
		}) as IndicatorTooltipData,
	};
}

export function createPaneIndicators(
	chart: Chart,
	pane: ScenePane,
	paneIndex: number,
	idMap: EngineIdMap,
): void {
	const primaryAxisId = pane.yAxes.find((axis) => axis.role === 'primary')?.id;
	const ordered = [...pane.indicators].sort((left, right) => {
		const leftPrimary = left.yAxisId === primaryAxisId ? 0 : 1;
		const rightPrimary = right.yAxisId === primaryAxisId ? 0 : 1;
		return leftPrimary - rightPrimary;
	});
	for (const indicator of ordered) {
		if (pane.kind === 'indicator' && !indicator.visible) continue;
		const originalIndex = pane.indicators.findIndex((candidate) => candidate.id === indicator.id);
		const id = chart.createIndicator(
			toIndicatorCreate(indicator, idMap, `/panes/${paneIndex}/indicators/${originalIndex}`),
			true,
		);
		if (id === null || id !== indicator.id) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/panes/${paneIndex}/indicators/${originalIndex}`,
				`KLineCharts failed to create Indicator ${indicator.id}.`,
			);
		}
	}
}
