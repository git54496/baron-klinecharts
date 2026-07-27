import minimalScene from '../../../../tests/fixtures/scenes/minimal-valid.json';
import type {
	ChartScene,
	SceneIndicator,
	SceneOverlay,
} from '../../src/generated/chart-scene.js';

export const INDICATOR_PARAMS: Readonly<Record<SceneIndicator['name'], readonly number[]>> = {
	MA: [5, 10, 30, 60],
	EMA: [6, 12, 20],
	SMA: [12, 2],
	BBI: [3, 6, 12, 24],
	VOL: [5, 10, 20],
	MACD: [12, 26, 9],
	BOLL: [20, 2],
	KDJ: [9, 3, 3],
	RSI: [6, 12, 24],
	BIAS: [6, 12, 24],
	BRAR: [26],
	CCI: [20],
	DMI: [14, 6],
	CR: [26, 10, 20, 40, 60],
	PSY: [12, 6],
	DMA: [10, 50, 10],
	TRIX: [12, 9],
	OBV: [30],
	VR: [26, 6],
	WR: [6, 10, 14],
	MTM: [12, 6],
	EMV: [14, 9],
	SAR: [2, 2, 20],
	AO: [5, 34],
	ROC: [12, 6],
	PVT: [],
	AVP: [],
};

export const INDICATOR_NAMES = Object.keys(INDICATOR_PARAMS) as SceneIndicator['name'][];

export function makeScene(): ChartScene {
	return structuredClone(minimalScene) as unknown as ChartScene;
}

export function makeIndicator(name: SceneIndicator['name'], index = 0): SceneIndicator {
	return {
		id: `indicator-${name.toLowerCase()}-${index}`,
		name,
		paneId: `pane-indicator-${index}`,
		yAxisId: `axis-indicator-${index}`,
		calcParams: [...INDICATOR_PARAMS[name]],
		precision: 2,
		visible: true,
		zLevel: 0,
		styles: {
			lines: [
				{
					color: 'rgba(41, 98, 255, 1)',
					size: 1,
					style: 'solid',
				},
			],
			bars: [],
			circles: [],
		},
	};
}

export function addIndicatorPane(scene: ChartScene, indicator: SceneIndicator): void {
	scene.panes.push({
		id: indicator.paneId,
		kind: 'indicator',
		order: scene.panes.length,
		height: 160,
		minHeight: 100,
		state: 'normal',
		yAxes: [
			{
				id: indicator.yAxisId,
				role: 'primary',
				position: 'right',
				reverse: false,
				inside: false,
				scrollZoomEnabled: true,
				topGap: 0.1,
				bottomGap: 0.1,
			},
		],
		indicators: [indicator],
	});
}

const overlayStyles: SceneOverlay['styles'] = {
	line: {
		color: 'rgba(41, 98, 255, 1)',
		size: 1,
		style: 'solid',
	},
	fill: {
		color: 'rgba(41, 98, 255, 0.15)',
	},
	text: {
		color: 'rgba(255, 255, 255, 1)',
		size: 12,
		family: 'Baron Sans',
		weight: 'normal',
		backgroundColor: 'rgba(41, 98, 255, 1)',
		borderColor: 'rgba(41, 98, 255, 1)',
	},
};

const firstPoint = { timestamp: 1784736000000, value: 12.4 };
const secondPoint = { timestamp: 1784822400000, value: 12.7 };
const thirdPoint = { timestamp: 1784908800000, value: 12.5 };

export function makeOverlay(type: SceneOverlay['type'], index = 0): SceneOverlay {
	const base: SceneOverlay = {
		id: `overlay-${type}-${index}`,
		type,
		paneId: 'pane-candle',
		visible: true,
		locked: false,
		zLevel: 0,
		mode: 'normal',
		styles: structuredClone(overlayStyles),
	};
	switch (type) {
		case 'horizontalStraightLine':
		case 'priceLine':
			return { ...base, anchor: { value: 12.5 } };
		case 'verticalStraightLine':
			return { ...base, anchor: { timestamp: firstPoint.timestamp } };
		case 'horizontalRayLine':
		case 'horizontalSegment':
			return {
				...base,
				value: 12.5,
				startTimestamp: firstPoint.timestamp,
				endTimestamp: secondPoint.timestamp,
			};
		case 'verticalRayLine':
		case 'verticalSegment':
			return {
				...base,
				timestamp: secondPoint.timestamp,
				startValue: 12.2,
				endValue: 12.8,
			};
		case 'priceChannelLine':
		case 'parallelStraightLine':
			return { ...base, points: [firstPoint, secondPoint, thirdPoint] };
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
			return { ...base, points: [firstPoint, secondPoint] };
		case 'brush':
			return { ...base, points: [firstPoint, secondPoint, thirdPoint] };
		case 'simpleTag':
			return { ...base, anchor: { value: 12.5 }, text: '标签' };
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			return { ...base, point: firstPoint, text: '文本' };
		case 'rectangle':
		case 'arrow':
			return { ...base, start: firstPoint, end: secondPoint };
		case 'crossLine':
			return { ...base, point: firstPoint };
	}
}
