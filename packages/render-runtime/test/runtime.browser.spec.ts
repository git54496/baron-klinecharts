import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';
import { parseChartScene } from '@baron1996/kline-scene-schema';

import { buildStandaloneHtml } from '../src/html.js';
import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');

test('@browser ready waits for delayed initial ResizeObserver deliveries', async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: {
			width: minimalScene.render.width,
			height: minimalScene.render.height,
		},
		locale: minimalScene.chart.locale,
		timezoneId: minimalScene.chart.timezone,
	});
	await context.addInitScript(() => {
		const instrumentedWindow = window as typeof window & {
			readonly __BARON_PENDING_FIRST_RESIZES__?: number;
		};
		const NativeResizeObserver = window.ResizeObserver;
		let pendingFirstResizeObservations = 0;

		class DelayedFirstResizeObserver implements ResizeObserver {
			private readonly callback: ResizeObserverCallback;
			private readonly nativeObserver: ResizeObserver;
			private firstDeliveryScheduled = false;
			private firstDeliveryCompleted = false;
			private observed = false;

			public constructor(callback: ResizeObserverCallback) {
				this.callback = callback;
				this.nativeObserver = new NativeResizeObserver((entries) => {
					if (this.firstDeliveryCompleted) {
						this.callback(entries, this);
						return;
					}
					if (this.firstDeliveryScheduled) {
						return;
					}
					this.firstDeliveryScheduled = true;
					window.setTimeout(() => {
						this.firstDeliveryCompleted = true;
						pendingFirstResizeObservations--;
						this.callback(entries, this);
					}, 75);
				});
			}

			public disconnect(): void {
				this.nativeObserver.disconnect();
			}

			public observe(target: Element, options?: ResizeObserverOptions): void {
				if (!this.observed) {
					this.observed = true;
					pendingFirstResizeObservations++;
				}
				this.nativeObserver.observe(target, options);
			}

			public unobserve(target: Element): void {
				this.nativeObserver.unobserve(target);
			}
		}

		Object.defineProperty(instrumentedWindow, '__BARON_PENDING_FIRST_RESIZES__', {
			configurable: false,
			get: () => pendingFirstResizeObservations,
		});
		window.ResizeObserver = DelayedFirstResizeObserver;
	});
	try {
		const page = await context.newPage();
		await page.setContent(buildStandaloneHtml(minimalScene), {
			waitUntil: 'load',
		});
		await page.waitForFunction(
			() => typeof window.__BARON_KLINE_SCENE__ !== 'undefined',
		);
		await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);

		expect(
			await page.evaluate(
				() =>
					(
						window as typeof window & {
							readonly __BARON_PENDING_FIRST_RESIZES__?: number;
						}
					).__BARON_PENDING_FIRST_RESIZES__,
			),
		).toBe(0);
	} finally {
		await context.close();
	}
});

test('@browser standalone file is offline, editable, and exports a valid Scene', async ({
	browser,
}) => {
	const directory = await mkdtemp(join(tmpdir(), 'baron-standalone-html-'));
	const htmlPath = join(directory, 'scene.html');
	await writeFile(htmlPath, buildStandaloneHtml(minimalScene), 'utf8');
	const externalRequests: string[] = [];
	const context = await browser.newContext({
		offline: true,
		serviceWorkers: 'block',
		viewport: {
			width: minimalScene.render.width,
			height: minimalScene.render.height + 100,
		},
		locale: minimalScene.chart.locale,
		timezoneId: minimalScene.chart.timezone,
	});
	try {
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') {
				errors.push(message.text());
			}
		});
		page.on('request', (request) => {
			if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) {
				externalRequests.push(request.url());
			}
		});
		await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
		await page.waitForTimeout(500);
		const hasBridge = await page.evaluate(
			() => typeof window.__BARON_KLINE_SCENE__ !== 'undefined',
		);
		expect({ hasBridge, errors }).toEqual({ hasBridge: true, errors: [] });
		await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);
		expect(externalRequests).toEqual([]);
		const chartTouchAction = await page
			.locator('[data-baron-render-root] > :first-child')
			.evaluate((element) => getComputedStyle(element).touchAction);
		expect(chartTouchAction).toBe('none');

		await page.locator('[data-overlay-type="segment"]').click();
		const overlayCanvas = page.locator('[data-baron-render-root] canvas').nth(1);
		await overlayCanvas.click();
		await page.waitForTimeout(350);
		await overlayCanvas.click();
		const exported = await expect
			.poll(() =>
				page.evaluate(() => window.__BARON_KLINE_SCENE__.exportScene()),
			)
			.toMatchObject({ overlays: [{ type: 'segment' }] });
		void exported;
		const scene = await page.evaluate(() => window.__BARON_KLINE_SCENE__.exportScene());
		expect(parseChartScene(scene).overlays).toHaveLength(1);
		await page.evaluate(() => window.__BARON_KLINE_SCENE__.destroy());
	} finally {
		await context.close();
		await rm(directory, { recursive: true, force: true });
	}
});
