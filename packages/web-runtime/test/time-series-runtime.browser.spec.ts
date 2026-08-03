import { expect, test } from '@playwright/test';

import { timeSeriesScene } from './time-series-scene.js';

test.describe('@browser Time Series Runtime', () => {
	test('owns ordered legend, visibility, replacement events, and destruction', async ({ page }) => {
		await page.goto('/test/fixture.html');
		const result = await page.evaluate(async (scene) => {
			const { createTimeSeriesRuntime } = await import('/src/index.ts');
			const events: Array<{ type: string }> = [];
			const container = document.querySelector<HTMLElement>('#chart')!;
			const runtime = await createTimeSeriesRuntime(container, scene, {
				onEvent: (event) => events.push(event),
			});
			const legend = [...container.querySelectorAll<HTMLButtonElement>(
				'[data-time-series-id]',
			)];
			legend[1]!.click();
			const afterVisibility = runtime.exportScene();
			await runtime.replaceData([
				{ timestamp: 1_767_484_800_000, values: { sh: 30, sz: null, total: 30 } },
				{ timestamp: 1_767_571_200_000, values: { sh: 31, sz: 41, total: 72 } },
			]);
			const afterReplacement = runtime.exportScene();
			let secondaryEventCount = 0;
			const unsubscribe = runtime.subscribe(() => secondaryEventCount++);
			unsubscribe();
			runtime.setSeriesVisible('sh', false);
			runtime.destroy();
			runtime.destroy();
			let destroyedError: { code: string; path: string } | null = null;
			try {
				runtime.exportScene();
			} catch (error) {
				const issue = error as { code: string; path: string };
				destroyedError = { code: issue.code, path: issue.path };
			}
			return {
				legend: legend.map((button) => ({
					id: button.dataset.timeSeriesId,
					text: button.textContent,
				})),
				afterVisibility,
				afterReplacement,
				eventTypes: events.map((event) => event.type),
				secondaryEventCount,
				childCount: container.childElementCount,
				destroyedError,
			};
		}, timeSeriesScene);

		expect(result.legend).toEqual([
			{ id: 'sh', text: expect.stringContaining('沪市') },
			{ id: 'sz', text: expect.stringContaining('深市') },
			{ id: 'total', text: expect.stringContaining('总成交额') },
		]);
		expect(result.afterVisibility.series[1]!.visible).toBe(false);
		expect(result.afterReplacement.series[1]!.visible).toBe(false);
		expect(result.afterReplacement.viewport).toEqual({
			barSpace: 8,
			rightOffsetDistance: 24,
			anchorTimestamp: 1_767_571_200_000,
		});
		expect(result.eventTypes).toEqual([
			'scene-ready',
			'series-visibility-changed',
			'data-replaced',
			'series-visibility-changed',
		]);
		expect(result.secondaryEventCount).toBe(0);
		expect(result.childCount).toBe(0);
		expect(result.destroyedError).toEqual({
			code: 'TIME_SERIES_RUNTIME_DESTROYED',
			path: '/runtime',
		});
	});

	test('emits a creation error and leaves no partial DOM', async ({ page }) => {
		await page.goto('/test/fixture.html');
		const result = await page.evaluate(async (scene) => {
			const { createTimeSeriesRuntime } = await import('/src/index.ts');
			const events: Array<{ type: string; issues?: Array<{ code: string; path: string }> }> = [];
			const container = document.querySelector<HTMLElement>('#chart')!;
			let error: { code: string; path: string } | null = null;
			try {
				await createTimeSeriesRuntime(
					container,
					{ ...scene, version: 2 },
					{ onEvent: (event) => events.push(event) },
				);
			} catch (reason) {
				const issue = reason as { code: string; path: string };
				error = { code: issue.code, path: issue.path };
			}
			return { events, error, childCount: container.childElementCount };
		}, timeSeriesScene);

		expect(result.error).toEqual({
			code: 'TIME_SERIES_SCENE_VERSION_UNSUPPORTED',
			path: '/version',
		});
		expect(result.events).toEqual([
			expect.objectContaining({
				type: 'scene-error',
				issues: [expect.objectContaining({
					code: 'TIME_SERIES_SCENE_VERSION_UNSUPPORTED',
					path: '/version',
				})],
			}),
		]);
		expect(result.childCount).toBe(0);
	});

	test('isolates host listener failures from creation and state changes', async ({ page }) => {
		await page.goto('/test/fixture.html');
		const result = await page.evaluate(async (scene) => {
			const { createTimeSeriesRuntime } = await import('/src/index.ts');
			const container = document.querySelector<HTMLElement>('#chart')!;
			const received: string[] = [];
			const runtime = await createTimeSeriesRuntime(container, scene, {
				onEvent: () => {
					throw new Error('host listener failure');
				},
			});
			runtime.subscribe(() => {
				throw new Error('secondary listener failure');
			});
			runtime.subscribe((event) => received.push(event.type));
			const updated = runtime.setSeriesVisible('sh', false);
			runtime.destroy();

			let creationError: { code: string; path: string } | null = null;
			try {
				await createTimeSeriesRuntime(
					container,
					{ ...scene, version: 2 },
					{ onEvent: () => { throw new Error('error listener failure'); } },
				);
			} catch (error) {
				const issue = error as { code: string; path: string };
				creationError = { code: issue.code, path: issue.path };
			}
			return {
				received,
				visible: updated.series[0]?.visible,
				creationError,
			};
		}, timeSeriesScene);

		expect(result).toEqual({
			received: ['series-visibility-changed'],
			visible: false,
			creationError: {
				code: 'TIME_SERIES_SCENE_VERSION_UNSUPPORTED',
				path: '/version',
			},
		});
	});

	test('emits errors before rejecting unknown series and invalid data atomically', async ({ page }) => {
		await page.goto('/test/fixture.html');
		const result = await page.evaluate(async (scene) => {
			const { createTimeSeriesRuntime } = await import('/src/index.ts');
			const events: Array<{ type: string; issues?: Array<{ code: string }> }> = [];
			const runtime = await createTimeSeriesRuntime(
				document.querySelector<HTMLElement>('#chart')!,
				scene,
				{ onEvent: (event) => events.push(event) },
			);
			const before = runtime.exportScene();
			for (const action of [
				() => runtime.setSeriesVisible('missing', false),
				() => runtime.replaceData([]),
			]) {
				try {
					await action();
				} catch {
					// 错误通过事件和最终状态共同断言。
				}
			}
			const after = runtime.exportScene();
			runtime.destroy();
			return {
				events,
				unchanged: JSON.stringify(before) === JSON.stringify(after),
			};
		}, timeSeriesScene);

		expect(result.events.slice(1)).toEqual([
			expect.objectContaining({
				type: 'scene-error',
				issues: [expect.objectContaining({ code: 'TIME_SERIES_UNKNOWN_SERIES' })],
			}),
			expect.objectContaining({
				type: 'scene-error',
				issues: expect.arrayContaining([
					expect.objectContaining({ code: 'TIME_SERIES_DATA_INVALID' }),
				]),
			}),
		]);
		expect(result.unchanged).toBe(true);
	});

	test('shows only visible series in the tooltip and emits complete crosshair values', async ({ page }) => {
		await page.goto('/test/fixture.html');
		await page.evaluate(async (scene) => {
			const { createTimeSeriesRuntime } = await import('/src/index.ts');
			const events: Array<{
				type: string;
				timestamp?: number | null;
				values?: Record<string, number | null> | null;
			}> = [];
			const container = document.querySelector<HTMLElement>('#chart')!;
			const runtime = await createTimeSeriesRuntime(container, scene, {
				onEvent: (event) => events.push(event),
			});
			Object.assign(window, {
				__baronTimeSeriesRuntime: runtime,
				__baronTimeSeriesEvents: events,
			});
		}, timeSeriesScene);

		const chart = page.locator('#chart');
		const box = await chart.boundingBox();
		expect(box).not.toBeNull();
		await page.mouse.move(box!.x + box!.width - 73, box!.y + 300);
		await expect.poll(() => page.locator(
			'.baron-time-series-runtime__tooltip:not([hidden])',
		).count()).toBe(1);
		await expect.poll(() => page.locator(
			'.baron-time-series-runtime__tooltip',
		).textContent()).toContain('—');

		const nullPoint = await page.evaluate(() => {
			const events = (
				window as unknown as {
					__baronTimeSeriesEvents: Array<{
						type: string;
						timestamp?: number | null;
						values?: Record<string, number | null> | null;
					}>;
				}
			).__baronTimeSeriesEvents;
			return events.filter(
				(event) => event.type === 'crosshair-changed' && event.timestamp !== null,
			).at(-1);
		});
		expect(nullPoint?.values).toEqual({ sh: 12, sz: null, total: 32 });

		await page.locator('[data-time-series-id="sz"]').click();
		await page.mouse.move(box!.x + box!.width - 100, box!.y + 300);
		await page.mouse.move(box!.x + box!.width - 65, box!.y + 300);

		const result = await page.evaluate(() => {
			const events = (
				window as unknown as {
					__baronTimeSeriesEvents: Array<{
						type: string;
						timestamp?: number | null;
						values?: Record<string, number | null> | null;
					}>;
				}
			).__baronTimeSeriesEvents;
			const crosshair = events.filter(
				(event) => event.type === 'crosshair-changed' && event.timestamp !== null,
			).at(-1);
			const tooltip = document.querySelector<HTMLElement>(
				'.baron-time-series-runtime__tooltip',
			)!;
			return {
				tooltipText: tooltip.textContent,
				crosshair,
			};
		});

		expect(result.tooltipText).toContain('沪市');
		expect(result.tooltipText).toContain('总成交额');
		expect(result.tooltipText).not.toContain('深市');
		expect(Object.keys(result.crosshair?.values ?? {})).toEqual(['sh', 'sz', 'total']);

		await page.mouse.move(box!.x - 10, box!.y - 10);
		await expect.poll(() => page.evaluate(() => (
			window as unknown as {
				__baronTimeSeriesEvents: Array<{ type: string; timestamp?: number | null }>;
			}
		).__baronTimeSeriesEvents.at(-1)?.timestamp)).toBeNull();
		await page.evaluate(() => (
			window as unknown as { __baronTimeSeriesRuntime: { destroy(): void } }
		).__baronTimeSeriesRuntime.destroy());
	});
});
