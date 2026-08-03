import { expect, test } from '@playwright/test';

const scene = {
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
			id: 'series-a', name: 'Series A', type: 'line', unit: 'unit',
			precision: 2, visible: true,
			style: { color: 'rgba(96, 165, 250, 1)', size: 2, style: 'solid' },
		},
		{
			id: 'series-b', name: 'Series B', type: 'line', unit: 'unit',
			precision: 2, visible: true,
			style: { color: 'rgba(249, 115, 22, 1)', size: 2, style: 'dashed' },
		},
	],
	data: [
		{ timestamp: 1_767_225_600_000, values: { 'series-a': 10, 'series-b': 20 } },
		{ timestamp: 1_767_312_000_000, values: { 'series-a': 12, 'series-b': null } },
		{ timestamp: 1_767_398_400_000, values: { 'series-a': 14, 'series-b': 24 } },
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
		barSpace: 8, rightOffsetDistance: 24, anchorTimestamp: 1_767_398_400_000,
	},
	render: {
		width: 1280, height: 720, deviceScaleFactor: 1,
		background: 'rgba(17, 24, 39, 1)', fontFamily: 'Baron Sans', timeoutMs: 10_000,
	},
	metadata: {},
} as const;

test.describe('@browser Time Series Adapter', () => {
	test('draws private values, updates atomically, and disposes cleanly', async ({ page }) => {
		await page.goto('/test/fixture.html');
		const result = await page.evaluate(async (input) => {
			const { TimeSeriesChartsAdapter } = await import('/src/index.ts');
			const container = document.querySelector<HTMLElement>('#chart')!;
			container.style.backgroundColor = 'rgb(1, 2, 3)';
			const adapter = await TimeSeriesChartsAdapter.create(container, input);
			await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
			const initial = adapter.exportScene();
			adapter.setSeriesVisible('series-b', false);
			adapter.setSeriesVisible('series-a', false);
			const hidden = adapter.exportScene();
			adapter.setSeriesVisible('series-a', true);
			adapter.replaceData([
				{ timestamp: 1_767_484_800_000, values: { 'series-a': 30, 'series-b': null } },
				{ timestamp: 1_767_571_200_000, values: { 'series-a': 31, 'series-b': 41 } },
			]);
			await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
			const replaced = adapter.exportScene();
			const childCount = container.childElementCount;
			adapter.dispose();
			adapter.dispose();
			return {
				initial,
				hidden,
				replaced,
				childCount,
				afterDispose: container.childElementCount,
				background: container.style.backgroundColor,
			};
		}, scene);

		expect(result.initial.data).toHaveLength(3);
		expect(result.initial.series.map((item) => item.visible)).toEqual([true, true]);
		expect(result.hidden.series.every((item) => !item.visible)).toBe(true);
		expect(result.replaced.data).toHaveLength(2);
		expect(result.replaced.series.map((item) => item.visible)).toEqual([true, false]);
		expect(result.childCount).toBeGreaterThan(0);
		expect(result.afterDispose).toBe(0);
		expect(result.background).toBe('rgb(1, 2, 3)');
	});

	test('excludes hidden series from the rendered y-axis range', async ({ page }) => {
		await page.goto('/test/fixture.html');
		const spans = await page.evaluate(async (input) => {
			const { TimeSeriesChartsAdapter } = await import('/src/index.ts');
			const candidate = structuredClone(input);
			candidate.series[1].visible = false;
			for (const [index, point] of candidate.data.entries()) {
				point.values['series-b'] = 1_000_000_000 + index;
			}
			const container = document.querySelector<HTMLElement>('#chart')!;
			const adapter = await TimeSeriesChartsAdapter.create(container, candidate);
			const waitForPaint = async (): Promise<void> => {
				await new Promise<void>((resolve) => requestAnimationFrame(() => {
					requestAnimationFrame(() => resolve());
				}));
			};
			const blueSpan = (): { samples: number; span: number } => {
				const rows: number[] = [];
				for (const canvas of container.querySelectorAll('canvas')) {
					if (canvas.width === 0 || canvas.height === 0) {
						continue;
					}
					const context = canvas.getContext('2d');
					if (context === null) {
						continue;
					}
					const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
					for (let offset = 0; offset < pixels.length; offset += 4) {
						const red = pixels[offset] ?? 0;
						const green = pixels[offset + 1] ?? 0;
						const blue = pixels[offset + 2] ?? 0;
						const alpha = pixels[offset + 3] ?? 0;
						if (red >= 80 && red <= 115 && green >= 145 && green <= 185 && blue >= 230 && alpha >= 150) {
							rows.push(Math.floor(offset / 4 / canvas.width));
						}
					}
				}
				return rows.length === 0
					? { samples: 0, span: 0 }
					: { samples: rows.length, span: Math.max(...rows) - Math.min(...rows) };
			};

			await waitForPaint();
			const hidden = blueSpan();
			adapter.setSeriesVisible('series-b', true);
			await waitForPaint();
			const visible = blueSpan();
			adapter.setSeriesVisible('series-b', false);
			await waitForPaint();
			const hiddenAgain = blueSpan();
			adapter.dispose();
			return { hidden, visible, hiddenAgain };
		}, scene);

		expect(spans.hidden.samples).toBeGreaterThan(0);
		expect(spans.hidden.span).toBeGreaterThan(100);
		expect(spans.visible.span).toBeLessThan(10);
		expect(spans.hiddenAgain.span).toBeGreaterThan(100);
	});

	test('rejects unknown series and preserves data after an invalid replacement', async ({ page }) => {
		await page.goto('/test/fixture.html');
		const result = await page.evaluate(async (input) => {
			const { TimeSeriesChartsAdapter } = await import('/src/index.ts');
			const container = document.querySelector<HTMLElement>('#chart')!;
			const adapter = await TimeSeriesChartsAdapter.create(container, input);
			const before = adapter.exportScene();
			const errors: Array<{ code: string; path: string; issuePath: string }> = [];
			try {
				adapter.setSeriesVisible('missing-series', false);
			} catch (error) {
				const issue = error as { code: string; path: string };
				errors.push({ code: issue.code, path: issue.path, issuePath: issue.path });
			}
			try {
				adapter.replaceData([
					{ timestamp: 1_767_484_800_000, values: { 'series-a': 30, 'series-b': 40 } },
					{ timestamp: 1_767_484_800_000, values: { 'series-a': 31, 'series-b': 41 } },
				]);
			} catch (error) {
				const issue = error as {
					code: string;
					path: string;
					issues: Array<{ path: string }>;
				};
				errors.push({
					code: issue.code,
					path: issue.path,
					issuePath: issue.issues[0]?.path ?? '',
				});
			}
			const after = adapter.exportScene();
			adapter.dispose();
			return { errors, unchanged: JSON.stringify(before) === JSON.stringify(after) };
		}, scene);

		expect(result.errors).toEqual([
			{
				code: 'TIME_SERIES_UNKNOWN_SERIES',
				path: '/series',
				issuePath: '/series',
			},
			{
				code: 'TIME_SERIES_DATA_INVALID',
				path: '/data',
				issuePath: '/data/1/timestamp',
			},
		]);
		expect(result.unchanged).toBe(true);
	});
});
