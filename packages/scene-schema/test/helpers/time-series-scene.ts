export function makeTimeSeriesScene(): Record<string, unknown> {
	return {
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
				id: 'series-a',
				name: 'Series A',
				type: 'line',
				unit: 'unit',
				precision: 2,
				visible: true,
				style: {
					color: 'rgba(96, 165, 250, 1)',
					size: 2,
					style: 'solid',
				},
			},
		],
		data: [
			{
				timestamp: 1_767_225_600_000,
				values: { 'series-a': 12.34 },
			},
		],
		chart: {
			locale: 'zh-CN',
			timezone: 'Asia/Shanghai',
			layout: {
				backgroundColor: 'rgba(17, 24, 39, 1)',
				textColor: 'rgba(219, 234, 254, 1)',
				fontFamily: 'Baron Sans',
				fontSize: 12,
			},
			grid: {
				horizontalColor: 'rgba(48, 59, 78, 1)',
				verticalColor: 'rgba(48, 59, 78, 1)',
			},
			thousandsSeparator: ',',
			decimalFold: { enabled: false, threshold: 4 },
			zoomAnchor: 'cursor',
			dateFormat: 'yyyy-MM-dd',
			largeNumberFormat: 'chinese',
		},
		viewport: {
			barSpace: 8,
			rightOffsetDistance: 24,
			anchorTimestamp: 1_767_225_600_000,
		},
		render: {
			width: 1280,
			height: 720,
			deviceScaleFactor: 1,
			background: 'rgba(17, 24, 39, 1)',
			fontFamily: 'Baron Sans',
			timeoutMs: 10_000,
		},
		metadata: {},
	};
}
