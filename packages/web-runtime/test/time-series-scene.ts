export const timeSeriesScene = {
	schema: '@baron1996/time-series-scene',
	version: 1,
	runtime: {
		engine: 'klinecharts',
		engineVersion: '10.0.0',
		runtimeVersion: '0.1.0',
	},
	period: { span: 1, type: 'day' },
	series: [
		{
			id: 'sh', name: '沪市', type: 'line', unit: '亿元', precision: 2,
			visible: true,
			style: { color: 'rgba(96, 165, 250, 1)', size: 2, style: 'solid' },
		},
		{
			id: 'sz', name: '深市', type: 'line', unit: '亿元', precision: 2,
			visible: true,
			style: { color: 'rgba(249, 115, 22, 1)', size: 2, style: 'dashed' },
		},
		{
			id: 'total', name: '总成交额', type: 'line', unit: '亿元', precision: 2,
			visible: true,
			style: { color: 'rgba(52, 211, 153, 1)', size: 2, style: 'dotted' },
		},
	],
	data: [
		{ timestamp: 1_767_225_600_000, values: { sh: 10, sz: 20, total: 30 } },
		{ timestamp: 1_767_312_000_000, values: { sh: 12, sz: null, total: 32 } },
		{ timestamp: 1_767_398_400_000, values: { sh: 14, sz: 24, total: 38 } },
	],
	chart: {
		locale: 'zh-CN', timezone: 'Asia/Shanghai',
		layout: {
			backgroundColor: 'rgba(17, 24, 39, 1)',
			textColor: 'rgba(219, 234, 254, 1)',
			fontFamily: 'Baron Sans', fontSize: 12,
		},
		grid: {
			horizontalColor: 'rgba(48, 59, 78, 1)',
			verticalColor: 'rgba(48, 59, 78, 1)',
		},
		thousandsSeparator: ',', decimalFold: { enabled: false, threshold: 4 },
		zoomAnchor: 'cursor', dateFormat: 'yyyy-MM-dd', largeNumberFormat: 'chinese',
	},
	viewport: {
		barSpace: 8, rightOffsetDistance: 24,
		anchorTimestamp: 1_767_398_400_000,
	},
	render: {
		width: 1280, height: 720, deviceScaleFactor: 1,
		background: 'rgba(17, 24, 39, 1)', fontFamily: 'Baron Sans', timeoutMs: 10_000,
	},
	metadata: {},
} as const;
