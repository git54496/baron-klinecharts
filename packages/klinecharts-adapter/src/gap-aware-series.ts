import type {
	ChartScene,
	MarketData,
	MarketDataGap,
} from '@baron1996/kline-scene-schema';
import { SceneError } from '@baron1996/kline-scene-schema';
import type {
	Chart,
	IndicatorCreate,
	IndicatorTemplate,
	KLineData,
} from 'klinecharts';

export const GAP_AWARE_CANDLE_INDICATOR_ID = 'baron_gap_aware_candle';
export const GAP_AWARE_CANDLE_INDICATOR_NAME = 'BARON_GAP_AWARE_CANDLE';
export const GAP_AWARE_CANDLE_PANE_ID = 'baron_gap_aware_candle_pane';
export const GAP_AWARE_CANDLE_Y_AXIS_ID = 'baron_gap_aware_candle_y_axis';

export type GapAwareTimelineItem =
	| { readonly kind: 'bar'; readonly bar: MarketData }
	| { readonly kind: 'gap'; readonly gap: MarketDataGap };

export interface GapAwareCarrierData extends KLineData {
	/** 仅供 Adapter 内部绘制与十字线识别，不属于公开 MarketData。 */
	readonly __baronTimelineItem: GapAwareTimelineItem;
}

interface GapAwareCandleValue {
	readonly open: number | null;
	readonly high: number | null;
	readonly low: number | null;
	readonly close: number | null;
}

interface GapAwareCandleStyles {
	readonly upColor: string;
	readonly downColor: string;
	readonly noChangeColor: string;
	readonly upWickColor: string;
	readonly downWickColor: string;
	readonly noChangeWickColor: string;
}

function adapterError(path: string, message: string): SceneError {
	return new SceneError('RUNTIME_INIT_FAILED', path, message);
}

export function isGapAwareScene(scene: ChartScene): boolean {
	return scene.version === 2;
}

export function timelineSlotCount(scene: ChartScene): number {
	return scene.data.length + (scene.gaps?.length ?? 0);
}

export function gapCount(scene: ChartScene): number {
	return scene.gaps?.length ?? 0;
}

/** 将真实 Bar 与 Gap 合并为严格时间序的引擎索引载体。 */
export function toGapAwareCarrierData(
	scene: ChartScene,
): GapAwareCarrierData[] {
	if (!isGapAwareScene(scene) || scene.gaps === undefined) {
		throw adapterError('/gaps', 'Gap-aware carrier requires a ChartScene v2 gaps array.');
	}
	const carriers: GapAwareCarrierData[] = [];
	let barIndex = 0;
	let gapIndex = 0;
	while (barIndex < scene.data.length || gapIndex < scene.gaps.length) {
		const bar = scene.data[barIndex];
		const gap = scene.gaps[gapIndex];
		if (gap === undefined || (bar !== undefined && bar.timestamp < gap.timestamp)) {
			const snapshot = structuredClone(bar!);
			carriers.push({
				...snapshot,
				__baronTimelineItem: { kind: 'bar', bar: snapshot },
			});
			barIndex += 1;
			continue;
		}
		const snapshot = structuredClone(gap);
		carriers.push({
			timestamp: snapshot.timestamp,
			open: 0,
			high: 0,
			low: 0,
			close: 0,
			volume: 0,
			__baronTimelineItem: { kind: 'gap', gap: snapshot },
		});
		gapIndex += 1;
	}
	return carriers;
}

export function engineDataForScene(scene: ChartScene): readonly KLineData[] {
	return isGapAwareScene(scene)
		? toGapAwareCarrierData(scene)
		: structuredClone(scene.data) as unknown as KLineData[];
}

/** 将分页追加的真实 Bar 转为与当前场景一致的引擎载体。 */
export function engineHistoricalDataForScene(
	scene: ChartScene,
	data: readonly MarketData[],
): KLineData[] {
	if (!isGapAwareScene(scene)) {
		return structuredClone(data) as unknown as KLineData[];
	}
	return data.map((bar) => {
		const snapshot = structuredClone(bar);
		return {
			...snapshot,
			__baronTimelineItem: { kind: 'bar', bar: snapshot },
		} satisfies GapAwareCarrierData;
	});
}

export function timelineItemOf(
	data: KLineData | undefined,
): GapAwareTimelineItem | undefined {
	return (data as GapAwareCarrierData | undefined)?.__baronTimelineItem;
}

function directionOf(value: GapAwareCandleValue): 'up' | 'down' | 'flat' {
	if (value.close! > value.open!) {
		return 'up';
	}
	if (value.close! < value.open!) {
		return 'down';
	}
	return 'flat';
}

function bodyColor(
	styles: GapAwareCandleStyles,
	direction: 'up' | 'down' | 'flat',
): string {
	return direction === 'up'
		? styles.upColor
		: direction === 'down'
			? styles.downColor
			: styles.noChangeColor;
}

function wickColor(
	styles: GapAwareCandleStyles,
	direction: 'up' | 'down' | 'flat',
): string {
	return direction === 'up'
		? styles.upWickColor
		: direction === 'down'
			? styles.downWickColor
			: styles.noChangeWickColor;
}

export const gapAwareCandleIndicatorTemplate: IndicatorTemplate<
	GapAwareCandleValue,
	never,
	GapAwareCandleStyles
> = {
	name: GAP_AWARE_CANDLE_INDICATOR_NAME,
	shortName: '',
	series: 'price',
	shouldOhlc: false,
	shouldFormatBigNumber: false,
	figures: [
		// 只参与 Y 轴范围计算；没有 type 就不会创建引擎 Figure。
		{ key: 'low' },
		{
			key: 'high',
			type: 'bar',
			attrs({ data, coordinate, yAxis }) {
				if (data.current == null || data.current.close === null) {
					return null;
				}
				const high = yAxis.convertToPixel(data.current.high!);
				const low = yAxis.convertToPixel(data.current.low!);
				return {
					x: coordinate.current.x - 0.5,
					y: Math.min(high, low),
					width: 1,
					height: Math.max(1, Math.abs(high - low)),
				};
			},
			styles({ data, indicator }) {
				if (data.current == null || data.current.close === null) {
					return null;
				}
				return {
					style: 'fill',
					color: wickColor(
						indicator.extendData as GapAwareCandleStyles,
						directionOf(data.current),
					),
				};
			},
		},
		{
			key: 'close',
			type: 'bar',
			attrs({ data, coordinate, barSpace, yAxis }) {
				if (data.current == null || data.current.close === null) {
					return null;
				}
				const width = Math.max(1, barSpace.bar * 0.62);
				const open = yAxis.convertToPixel(data.current.open!);
				const close = yAxis.convertToPixel(data.current.close);
				const top = Math.min(open, close);
				return {
					x: coordinate.current.x - width / 2,
					y: top,
					width,
					height: Math.max(
						1,
						Math.abs(open - close),
					),
				};
			},
			styles({ data, indicator }) {
				if (data.current == null || data.current.close === null) {
					return null;
				}
				const color = bodyColor(
					indicator.extendData as GapAwareCandleStyles,
					directionOf(data.current),
				);
				return {
					style: 'fill',
					color,
					borderColor: color,
					borderSize: 0,
					borderRadius: 0,
				};
			},
		},
	],
	calc(dataList): GapAwareCandleValue[] {
		return dataList.map((data) => {
			const item = timelineItemOf(data);
			if (item?.kind !== 'bar') {
				return { open: null, high: null, low: null, close: null };
			}
			return {
				open: item.bar.open,
				high: item.bar.high,
				low: item.bar.low,
				close: item.bar.close,
			};
		});
	},
};

function indicatorCreate(scene: ChartScene): IndicatorCreate {
	const candle = scene.chart.candle;
	return {
		id: GAP_AWARE_CANDLE_INDICATOR_ID,
		name: GAP_AWARE_CANDLE_INDICATOR_NAME,
		shortName: '',
		paneId: GAP_AWARE_CANDLE_PANE_ID,
		yAxisId: GAP_AWARE_CANDLE_Y_AXIS_ID,
		precision: scene.symbol.pricePrecision,
		visible: true,
		zLevel: 0,
		extendData: {
			upColor: candle.upColor,
			downColor: candle.downColor,
			noChangeColor: candle.noChangeColor,
			upWickColor: candle.upWickColor,
			downWickColor: candle.downWickColor,
			noChangeWickColor: candle.noChangeWickColor,
		},
		styles: {
			lastValueMark: { show: false },
			tooltip: { showRule: 'none' },
		},
	};
}

/** 初始化仅绘制真实 Bar 的主序列；Gap 只保留横轴槽位。 */
export function installGapAwareMainSeries(
	scene: ChartScene,
	chart: Chart,
	registerIndicator: typeof import('klinecharts').registerIndicator,
): void {
	if (!isGapAwareScene(scene)) {
		return;
	}
	assertGapAwareSceneSupported(scene);
	registerIndicator(gapAwareCandleIndicatorTemplate);
	const createdId = chart.createIndicator(indicatorCreate(scene), true);
	if (createdId !== GAP_AWARE_CANDLE_INDICATOR_ID) {
		throw adapterError('/gaps', 'KLineCharts failed to create the Gap-aware main series.');
	}
	chart.setPaneOptions({
		id: 'candle_pane',
		height: 0,
		minHeight: 0,
		order: scene.panes.length,
		state: 'minimize',
		dragEnabled: false,
	});
}

export function assertGapAwareSceneSupported(scene: ChartScene): void {
	if (!isGapAwareScene(scene)) {
		return;
	}
	if (scene.chart.candle.type !== 'candle_solid') {
		throw adapterError(
			'/chart/candle/type',
			'ChartScene v2 MVP only supports the candle_solid gap-aware main series.',
		);
	}
	if (scene.panes.some((pane) => pane.indicators.length > 0)) {
		throw adapterError(
			'/panes',
			'ChartScene v2 indicators are disabled until their Gap semantics are implemented.',
		);
	}
}
