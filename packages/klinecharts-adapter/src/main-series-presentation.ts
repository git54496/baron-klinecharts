import type { ChartScene } from '@baron1996/kline-scene-schema';

export type MainSeriesPresentationErrorCode =
	| 'MAIN_SERIES_PRESENTATION_INVALID'
	| 'MAIN_SERIES_PRESENTATION_UNSUPPORTED'
	| 'MAIN_SERIES_PRESENTATION_APPLY_FAILED'
	| 'MAIN_SERIES_PRESENTATION_ROLLBACK_FAILED';

export class MainSeriesPresentationError extends Error {
	public readonly code: MainSeriesPresentationErrorCode;
	public readonly path: string;

	public constructor(
		code: MainSeriesPresentationErrorCode,
		path: string,
		message: string,
	) {
		super(message);
		this.name = 'MainSeriesPresentationError';
		this.code = code;
		this.path = path;
	}
}

/** 产品唯一 area 收盘价折线展示配置；值来源固定为 close。 */
export const STANDARD_CLOSE_LINE_PRESENTATION = {
	type: 'area',
	value: 'close',
	line: { color: 'rgba(41, 98, 255, 1)', size: 2 },
	backgroundColor: 'rgba(0, 0, 0, 0)',
	smooth: false,
	pointVisible: false,
} as const;

export type MainSeriesPresentation =
	| {
			readonly type: 'candle_solid' | 'candle_stroke' | 'candle_up_stroke'
				| 'candle_down_stroke' | 'ohlc';
	  }
	| typeof STANDARD_CLOSE_LINE_PRESENTATION;

export type ActiveMainSeriesType =
	| 'candle_solid'
	| 'candle_stroke'
	| 'candle_up_stroke'
	| 'candle_down_stroke'
	| 'ohlc'
	| 'area';

export interface MainSeriesPresentationResult {
	readonly activeType: ActiveMainSeriesType;
}

/**
 * 主序列展示端口；只由 K 线 Adapter 实现，与 Drawing 引擎端口分离。
 * 输入必须是完整 discriminated union，禁止从其他字段或引擎默认值兜底。
 */
export interface MainSeriesPresentationPort {
	applyMainSeriesPresentation(
		presentation: MainSeriesPresentation,
	): MainSeriesPresentationResult;
}

export function presentationToSceneCandle(
	scene: ChartScene,
	presentation: MainSeriesPresentation,
): ChartScene {
	if (presentation.type === 'area') {
		return {
			...structuredClone(scene),
			chart: {
				...structuredClone(scene.chart),
				candle: {
					...structuredClone(scene.chart.candle),
					type: 'area',
					area: {
						value: presentation.value,
						line: {
							color: presentation.line.color,
							size: presentation.line.size,
						},
						backgroundColor: presentation.backgroundColor,
						smooth: presentation.smooth,
						pointVisible: presentation.pointVisible,
					},
				},
			},
		};
	}
	const candle = structuredClone(scene.chart.candle);
	delete (candle as { area?: unknown }).area;
	return {
		...structuredClone(scene),
		chart: {
			...structuredClone(scene.chart),
			candle: { ...candle, type: presentation.type },
		},
	};
}
