import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const fixtureDirectory = join(packageDirectory, '..', '..', 'tests', 'fixtures', 'scenes');
const minimal = JSON.parse(await readFile(join(fixtureDirectory, 'minimal-valid.json'), 'utf8'));

const indicatorParams = {
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

const indicatorStyles = {
	lines: [{ color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' }],
	bars: [],
	circles: [],
};
const allIndicators = structuredClone(minimal);
allIndicators.panes.push({
	id: 'pane-indicators',
	kind: 'indicator',
	order: 1,
	height: 240,
	minHeight: 100,
	state: 'normal',
	yAxes: [
		{
			id: 'axis-indicators',
			role: 'primary',
			position: 'right',
			reverse: false,
			inside: false,
			scrollZoomEnabled: true,
			topGap: 0.1,
			bottomGap: 0.1,
		},
	],
	indicators: Object.entries(indicatorParams).map(([name, calcParams], index) => ({
		id: `indicator-${name.toLowerCase()}-${index}`,
		name,
		paneId: 'pane-indicators',
		yAxisId: 'axis-indicators',
		calcParams,
		precision: 2,
		visible: true,
		zLevel: index,
		styles: indicatorStyles,
	})),
});

const overlayStyles = {
	line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
	fill: { color: 'rgba(41, 98, 255, 0.15)' },
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

function overlay(type, geometry, index) {
	return {
		id: `overlay-${type}-${index}`,
		type,
		paneId: 'pane-candle',
		visible: true,
		locked: false,
		zLevel: index,
		mode: 'normal',
		styles: overlayStyles,
		...geometry,
	};
}

const overlayDefinitions = [
	['horizontalRayLine', { value: 12.5, startTimestamp: firstPoint.timestamp, endTimestamp: secondPoint.timestamp }],
	['horizontalSegment', { value: 12.5, startTimestamp: firstPoint.timestamp, endTimestamp: secondPoint.timestamp }],
	['horizontalStraightLine', { anchor: { value: 12.5 } }],
	['verticalRayLine', { timestamp: secondPoint.timestamp, startValue: 12.2, endValue: 12.8 }],
	['verticalSegment', { timestamp: secondPoint.timestamp, startValue: 12.2, endValue: 12.8 }],
	['verticalStraightLine', { anchor: { timestamp: firstPoint.timestamp } }],
	['rayLine', { points: [firstPoint, secondPoint] }],
	['segment', { points: [firstPoint, secondPoint] }],
	['straightLine', { points: [firstPoint, secondPoint] }],
	['priceLine', { anchor: { value: 12.5 } }],
	['priceChannelLine', { points: [firstPoint, secondPoint, thirdPoint] }],
	['parallelStraightLine', { points: [firstPoint, secondPoint, thirdPoint] }],
	['fibonacciLine', { points: [firstPoint, secondPoint] }],
	['brush', { points: [firstPoint, secondPoint, thirdPoint] }],
	['simpleAnnotation', { point: firstPoint, text: '注释' }],
	['simpleTag', { anchor: { value: 12.5 }, text: '标签' }],
	['rectangle', { start: firstPoint, end: secondPoint }],
	['arrow', { start: firstPoint, end: secondPoint }],
	['crossLine', { point: firstPoint }],
	['callout', { point: firstPoint, text: '气泡' }],
	['text', { point: firstPoint, text: '文本' }],
];
const allOverlays = structuredClone(minimal);
allOverlays.overlays = overlayDefinitions.map(([type, geometry], index) =>
	overlay(type, geometry, index),
);

const invalidOhlc = structuredClone(minimal);
invalidOhlc.data[0].low = invalidOhlc.data[0].high + 1;

const invalidDuplicateId = structuredClone(minimal);
invalidDuplicateId.panes[0].yAxes.push({
	...invalidDuplicateId.panes[0].yAxes[0],
	role: 'additional',
});

const invalidIndicatorReference = structuredClone(allIndicators);
invalidIndicatorReference.panes[1].indicators[0].yAxisId = 'axis-missing';

const invalidOverlayAnchor = structuredClone(minimal);
invalidOverlayAnchor.overlays = [
	overlay('verticalStraightLine', { anchor: { value: 12.5 } }, 0),
];

const invalidOverlayCode = structuredClone(minimal);
invalidOverlayCode.overlays = [
	{
		...overlay('segment', { points: [firstPoint, secondPoint] }, 0),
		draw: '() => alert(1)',
	},
];

const fixtures = {
	'all-indicators.json': allIndicators,
	'all-overlays.json': allOverlays,
	'invalid-ohlc.json': invalidOhlc,
	'invalid-duplicate-id.json': invalidDuplicateId,
	'invalid-indicator-reference.json': invalidIndicatorReference,
	'invalid-overlay-anchor.json': invalidOverlayAnchor,
	'invalid-overlay-code.json': invalidOverlayCode,
};

await Promise.all(
	Object.entries(fixtures).map(([name, value]) =>
		writeFile(join(fixtureDirectory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8'),
	),
);
