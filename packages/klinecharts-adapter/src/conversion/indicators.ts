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
} from 'klinecharts';

import type { EngineIdMap } from './id-map.js';
import { requireMappedId } from './id-map.js';
import { isSupportedIndicator } from '../registry/indicators.js';

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
