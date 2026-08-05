import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';
import {
	parseChartScene,
	parseTimeSeriesScene,
} from '@baron1996/kline-scene-schema';

import {
	buildStandaloneHtml,
	buildTimeSeriesStandaloneHtml,
} from '../src/html.js';
import { buildDrawableWorkspaceStandaloneHtml } from '../src/drawable-workspace-html.js';
import { loadScene } from './load-scene.js';
import { loadWorkspaceFixture } from './load-workspace.js';
import { timeSeriesScene } from './time-series-scene.js';

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

test('@browser Workspace HTML exposes only the Workspace bridge with full toolbar', async ({
	browser,
}) => {
	const workspace = await loadWorkspaceFixture('chart');
	const context = await browser.newContext({
		viewport: {
			width: workspace.scene.document.render.width,
			height: workspace.scene.document.render.height,
		},
		locale: workspace.scene.document.chart.locale,
		timezoneId: workspace.scene.document.chart.timezone,
	});
	try {
		const page = await context.newPage();
		await page.setContent(buildDrawableWorkspaceStandaloneHtml(workspace), {
			waitUntil: 'load',
		});
		await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.ready);
		const noLegacyBridge = await page.evaluate(
			() => typeof window.__BARON_KLINE_SCENE__,
		);
		expect(noLegacyBridge).toBe('undefined');
		const buttons = await page.locator('[data-overlay-type]').count();
		expect(buttons).toBe(22);
		const mainSeries = await page.locator('[data-action="main-series"]').count();
		expect(mainSeries).toBe(1);
		const exported = await page.evaluate(
			() => window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace(),
		);
		expect(exported.schema).toBe('@baron1996/drawable-workspace');
		await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.destroy());
	} finally {
		await context.close();
	}
});

test('@browser time-series Workspace HTML keeps 22 tools without main series control', async ({
	browser,
}) => {
	const workspace = await loadWorkspaceFixture('time-series');
	const context = await browser.newContext({
		viewport: {
			width: workspace.scene.document.render.width,
			height: workspace.scene.document.render.height,
		},
		locale: workspace.scene.document.chart.locale,
		timezoneId: workspace.scene.document.chart.timezone,
	});
	try {
		const page = await context.newPage();
		await page.setContent(buildDrawableWorkspaceStandaloneHtml(workspace), {
			waitUntil: 'load',
		});
		await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.ready);
		expect(await page.locator('[data-overlay-type]').count()).toBe(22);
		expect(await page.locator('[data-action="main-series"]').count()).toBe(0);
		const scaleHidden = await page
			.locator('[data-action="price-scale"]')
			.evaluate((element) => (element as HTMLSelectElement).hidden);
		expect(scaleHidden).toBe(true);
		const exported = await page.evaluate(
			() => window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace(),
		);
		expect(exported.scene.kind).toBe('time-series');
		await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.destroy());
	} finally {
		await context.close();
	}
});

test('@browser chart Workspace switches candle to area mid-creation', async ({
	browser,
}) => {
	const workspace = await loadWorkspaceFixture('chart');
	const context = await browser.newContext({
		viewport: {
			width: workspace.scene.document.render.width,
			height: workspace.scene.document.render.height,
		},
		locale: workspace.scene.document.chart.locale,
		timezoneId: workspace.scene.document.chart.timezone,
	});
	const directory = await mkdtemp(join(tmpdir(), 'baron-workspace-switch-'));
	const htmlPath = join(directory, 'workspace.html');
	await writeFile(
		htmlPath,
		buildDrawableWorkspaceStandaloneHtml(workspace),
		'utf8',
	);
	try {
		const page = await context.newPage();
		await page.goto(pathToFileURL(htmlPath).href, {
			waitUntil: 'load',
		});
		await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.ready);
		await page.locator('[data-overlay-type="segment"]').click();
		const overlayCanvas = page.locator('[data-baron-render-root] canvas').nth(1);
		await overlayCanvas.click({ position: { x: 400, y: 200 } });
		await page.waitForTimeout(600);
		// 创建尚未完成时切换主序列展示，Drawing 会话与当前交互必须保持。
		await page.selectOption('[data-action="main-series"]', 'area');
		await page.waitForTimeout(600);
		await overlayCanvas.click({ position: { x: 600, y: 300 } });
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace()
							.drawings.drawings.length,
				),
			)
			.toBe(23);
		const exported = await page.evaluate(
			() => window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace(),
		);
		expect(exported.scene.document.chart.candle.type).toBe('area');
		const segment = exported.drawings.drawings.find(
			(drawing: { readonly type: string }) => drawing.type === 'segment',
		);
		expect(segment?.geometry.points).toHaveLength(2);
		await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.destroy());
	} finally {
		await context.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('@browser raw Scene HTML keeps only the legacy bridge', async ({ browser }) => {
	const scene = loadScene('minimal-valid.json');
	const context = await browser.newContext({
		viewport: {
			width: scene.render.width,
			height: scene.render.height,
		},
		locale: scene.chart.locale,
		timezoneId: scene.chart.timezone,
	});
	try {
		const page = await context.newPage();
		await page.setContent(buildStandaloneHtml(scene), { waitUntil: 'load' });
		await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);
		const workspaceBridge = await page.evaluate(
			() => typeof window.__BARON_DRAWABLE_WORKSPACE__,
		);
		expect(workspaceBridge).toBe('undefined');
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

test('@browser Time Series standalone file is offline and exports a valid Scene', async ({
	browser,
}) => {
	const directory = await mkdtemp(join(tmpdir(), 'baron-time-series-html-'));
	const htmlPath = join(directory, 'time-series.html');
	await writeFile(htmlPath, buildTimeSeriesStandaloneHtml(timeSeriesScene), 'utf8');
	const externalRequests: string[] = [];
	const context = await browser.newContext({
		offline: true,
		serviceWorkers: 'block',
		viewport: {
			width: timeSeriesScene.render.width,
			height: timeSeriesScene.render.height,
		},
		locale: timeSeriesScene.chart.locale,
		timezoneId: timeSeriesScene.chart.timezone,
	});
	try {
		const page = await context.newPage();
		page.on('request', (request) => {
			if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) {
				externalRequests.push(request.url());
			}
		});
		await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
		await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);
		expect(externalRequests).toEqual([]);
		expect(await page.locator('[data-time-series-id="series-a"]').count()).toBe(1);
		expect(await page.locator('[data-baron-toolbar-root]').textContent()).toBe('');
		const exported = await page.evaluate(
			() => window.__BARON_KLINE_SCENE__.exportScene(),
		);
		expect(parseTimeSeriesScene(exported)).toEqual(
			parseTimeSeriesScene(timeSeriesScene),
		);
		await page.evaluate(() => window.__BARON_KLINE_SCENE__.destroy());
	} finally {
		await context.close();
		await rm(directory, { recursive: true, force: true });
	}
});
