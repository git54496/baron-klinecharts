import { expect, test, type Page } from '@playwright/test';
import { candleGeometry, CANDLE_ZOOM_LEVELS } from '../src/candle-zoom-levels.js';
import { loadScene } from './load-scene.js';

const scene = loadScene('minimal-valid.json');
const styles = ['candle_solid', 'candle_stroke', 'candle_up_stroke', 'candle_down_stroke'];

for (const dpr of [1, 3]) {
	test.describe(`mobile pinch DPR ${dpr}`, () => {
		test.use({ deviceScaleFactor: dpr, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
		for (const initialDistance of [100, 137, 240]) {
			test(`@browser pinch switches once per 20 CSS px from ${initialDistance}px`, async ({ page, context }) => {
				await setup(page);
				await page.evaluate(() => {
					document.querySelector<HTMLElement>('#chart')!.style.width = '390px';
					(window as any).__spacing.chart.resize();
				});
				const session = await context.newCDPSession(page);
				const touches = (distance: number) => [
					{ id: 1, x: 195 - distance / 2, y: 200 },
					{ id: 2, x: 195 + distance / 2, y: 200 },
				];
				const start = async (distance: number) => {
					await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(distance).slice(0, 1) });
					await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(distance) });
				};
				const move = async (distance: number, level: number) => {
					await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(distance) });
					await flush(page);
					expect((await snapshot(page)).space.bar).toBe(candleGeometry(level, dpr).pitch);
				};
				await start(initialDistance);
				for (const delta of [1, 10, 19, 5, 19]) await move(initialDistance + delta, 5);
				await move(initialDistance + 20, 6);
				await move(initialDistance + 39, 6);
				await move(initialDistance + 40, 7);
				await move(initialDistance + 80, 9); // One event can cross two thresholds.
				await move(initialDistance + 61, 9);
				await move(initialDistance + 60, 8);
				await move(initialDistance + 79, 8); // 19px remainder discarded on release.
				await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
				await start(100);
				await move(101, 8);
				await move(80, 7);
				await page.evaluate(() => (window as any).__spacing.chart.setZoomEnabled(false));
				await move(120, 7);
				await page.evaluate(() => (window as any).__spacing.chart.setZoomEnabled(true));
				await move(101, 7);
				await move(100, 6);
				await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
				await start(100);
				await move(119, 6);
				await move(120, 7);
				await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
				assertSpacing(await snapshot(page), 7, dpr);
				expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
			});
		}
	});
}

async function setup(page: Page) {
	await page.goto('/test/fixture.html');
	await page.evaluate(async scene => {
		const { createEngine } = await import('/src/engine.ts');
		scene.data = Array.from({ length: 400 }, (_, i) => ({
			timestamp: Date.UTC(2026, 0, 1 + i), open: i % 2 ? 8.85 : 8.80,
			close: i % 2 ? 8.77 : 8.85, high: 8.94, low: 8.66, volume: 1000 + i,
		}));
		// Include the actual reported pair, not only synthetic differently-heighted bodies.
		for (const [day, close, high, low] of [[6, 8.80, 8.94, 8.68], [7, 8.77, 8.92, 8.66]]) {
			const bar = scene.data.find((bar: any) => bar.timestamp === Date.UTC(2026, 7, day!))!;
			Object.assign(bar, { open: 8.85, close, high, low });
		}
		const { chart } = await createEngine(document.querySelector<HTMLElement>('#chart')!, scene);
		const store = (chart as any).getChartStore();
		const view = (chart as any).getDrawPaneById('candle_pane').getMainWidget()._candleBarView;
		const state = { chart, store, view, bodies: [] as any[], figures: [] as any[], zooms: [] as any[] };
		const draw = view.drawImp;
		view.drawImp = function (...args: any[]) {
			state.bodies = []; state.figures = [];
			return draw.apply(this, args);
		};
		for (const name of ['_createSolidBar', '_createStrokeBar']) {
			const create = view[name];
			view[name] = function (...args: any[]) {
				const figures = create.apply(this, args);
				state.bodies.push(structuredClone(figures[1].attrs));
				state.figures.push(structuredClone(figures));
				return figures;
			};
		}
		chart.subscribeAction('onZoom' as any, event => state.zooms.push(event));
		chart.setBarSpace(8);
		chart.scrollToDataIndex(300);
		(window as any).__spacing = state;
	}, structuredClone(scene));
	await flush(page);
}

async function flush(page: Page) {
	await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function snapshot(page: Page) {
	return page.evaluate(() => {
		const { chart, store, bodies } = (window as any).__spacing;
		return { space: chart.getBarSpace(), bodies, center: store.dataIndexToCoordinate(250),
			points: [249, 250, 251].map(dataIndex => chart.convertToPixel({ dataIndex, value: 8.8 })),
		};
	});
}

function assertSpacing(snapshot: Awaited<ReturnType<typeof snapshot>>, level: number, dpr: number) {
	const geometry = candleGeometry(level, dpr);
	expect(snapshot.space.bar).toBeCloseTo(geometry.pitch, 9);
	expect(snapshot.bodies.length).toBeGreaterThan(8);
	const bodies = [...snapshot.bodies].sort((a, b) => a.x - b.x);
	for (let index = 0; index < bodies.length; index++) {
		const body = bodies[index]!;
		expect(body.width).toBeCloseTo(geometry.body, 9);
		expect(body.x * dpr).toBeCloseTo(Math.round(body.x * dpr), 7);
		if (index > 0) expect((body.x - bodies[index - 1]!.x - body.width) * dpr).toBeCloseTo(geometry.gapPixels, 7);
	}
	for (let i = 1; i < 3; i++) expect(snapshot.points[i].x - snapshot.points[i - 1].x).toBeCloseTo(geometry.pitch, 9);
}

for (const dpr of [1, 1.25, 1.5, 2, 3]) {
	test.describe(`discrete candles DPR ${dpr}`, () => {
		test.use({ deviceScaleFactor: dpr });
		for (const style of styles) {
			test(`@browser all stops have equal gaps before/after fractional pan: ${style}`, async ({ page }, testInfo) => {
				await setup(page);
				await page.evaluate(style => (window as any).__spacing.chart.setStyles({ candle: { type: style } }), style);
				for (let level = CANDLE_ZOOM_LEVELS.length - 1; level >= 0; level--) {
					await page.evaluate(space => {
						const { chart } = (window as any).__spacing;
						chart.setBarSpace(space); chart.scrollToDataIndex(300);
					}, candleGeometry(level, dpr).pitch);
					await flush(page);
					assertSpacing(await snapshot(page), level, dpr);
					await page.evaluate(() => (window as any).__spacing.chart.scrollByDistance(17.37));
					await flush(page);
					assertSpacing(await snapshot(page), level, dpr);
				}
				// Render REAL engine figures at the minimum stop and the Aug 6/7 top
				// border. Count transparent physical columns between adjacent bodies.
				const raster = await page.evaluate(dpr => {
					const { figures, view } = (window as any).__spacing;
					const chosen = figures.filter((pair: any[]) => pair[1].attrs.x > 100 && pair[1].attrs.x < 900);
					const canvas = document.createElement('canvas'); canvas.width = 1000 * dpr; canvas.height = 600 * dpr;
					const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr);
					for (const pair of chosen) for (const figure of pair) view.createFigure(figure).draw(ctx);
					const gaps: number[] = []; const ink: number[] = [];
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					for (let i = 0; i < chosen.length - 1; i++) {
						const a = chosen[i][1].attrs, b = chosen[i + 1][1].attrs;
						const start = Math.round((a.x + a.width) * dpr), end = Math.round(b.x * dpr);
						let alpha = 0, bodyAlpha = 0;
						for (let y = Math.floor(a.y * dpr); y < Math.ceil((a.y + a.height) * dpr); y++) {
							for (let x = start; x < end; x++) alpha = Math.max(alpha, image.data[(y * canvas.width + x) * 4 + 3]!);
							bodyAlpha = Math.max(bodyAlpha, image.data[(y * canvas.width + Math.round(a.x * dpr)) * 4 + 3]!);
						}
						gaps.push(alpha); ink.push(bodyAlpha);
					}
					return { gaps, ink };
				}, dpr);
				expect(raster.gaps.length).toBeGreaterThan(20);
				for (const alpha of raster.gaps) expect(alpha).toBe(0);
				for (const alpha of raster.ink) expect(alpha).toBeGreaterThan(0);
				if (dpr === 2 && style === 'candle_solid') await page.locator('#chart').screenshot({ path: testInfo.outputPath('minimum-discrete-stop.png') });
			});
		}
	});
}

test('@browser wheel moves one stop, clamps endpoints, keeps anchor and allows real mouse dragging', async ({ page }) => {
	await setup(page);
	await page.mouse.move(450, 250);
	const index = await page.evaluate(() => (window as any).__spacing.store.coordinateToFloatIndex(450) - 0.5);
	for (const pitch of [7, 6, 4, 3, 2, 2]) {
		await page.mouse.wheel(0, 100);
		await expect.poll(async () => (await snapshot(page)).space.bar).toBe(pitch);
		await flush(page);
		const anchorX = await page.evaluate(index => (window as any).__spacing.store.dataIndexToCoordinate(index), index);
		expect(Math.abs(anchorX - 450)).toBeLessThanOrEqual(1);
	}
	for (const pitch of [3, 4, 6, 7, 8]) {
		await page.mouse.wheel(0, -100);
		await expect.poll(async () => (await snapshot(page)).space.bar).toBe(pitch);
	}
	await flush(page);
	const before = await snapshot(page);
	await page.mouse.down(); await page.mouse.move(550, 250, { steps: 10 }); await page.mouse.up();
	await flush(page);
	const after = await snapshot(page);
	expect(after.center - before.center).toBeCloseTo(100, 0);
	expect(after.space).toEqual(before.space);
	assertSpacing(after, 5, 1);
});

test('@browser API zoom snaps once even with duration, disabled zoom is inert, last-bar anchor is stable', async ({ page }) => {
	await setup(page);
	const result = await page.evaluate(async () => {
		const { chart, store, zooms } = (window as any).__spacing;
		chart.setZoomAnchor('last_bar');
		const before = store.dataIndexToCoordinate(399);
		chart.zoomAtCoordinate(0.5, { x: 350, y: 250 }, 200);
		const immediate = chart.getBarSpace().bar;
		await new Promise(resolve => setTimeout(resolve, 300));
		const after = store.dataIndexToCoordinate(399);
		const settled = chart.getBarSpace().bar;
		chart.setZoomEnabled(false);
		chart.zoomAtDataIndex(2, 250, 200);
		store.zoom(1, { x: 450 }, 'main');
		return { before, after, immediate, settled, disabled: chart.getBarSpace().bar, zooms };
	});
	expect(result.immediate).toBe(4);
	expect(result.settled).toBe(4);
	expect(result.disabled).toBe(4);
	expect(Math.abs(result.after - result.before)).toBeLessThanOrEqual(1);
	expect(result.zooms).toEqual([{ scale: 0.5 }]);
});

test('@browser resize re-resolves the same logical stop at a changed DPR', async ({ page }) => {
	await setup(page);
	await page.evaluate(() => {
		Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.25 });
		(window as any).__spacing.chart.resize();
	});
	await flush(page);
	assertSpacing(await snapshot(page), 5, 1.25);
});

test('@browser monitor DPR change realigns the lattice without a CSS size change', async ({ page, context }) => {
	await setup(page);
	const bounds = await page.locator('#chart').boundingBox();
	const session = await context.newCDPSession(page);
	for (const [index, dpr] of [1.25, 2, 1].entries()) {
		// CDP DPR-only overrides update devicePixelRatio but do not invalidate
		// media queries. A viewport change triggers the real resolution event;
		// the fixture's fixed-size chart must remain unchanged throughout.
		await session.send('Emulation.setDeviceMetricsOverride', {
			width: 1281 + index, height: 720, deviceScaleFactor: dpr, mobile: false,
		});
		await expect.poll(() => page.evaluate(() => ({
			dpr: window.devicePixelRatio,
			pitch: (window as any).__spacing.chart.getBarSpace().bar,
		}))).toEqual({ dpr, pitch: candleGeometry(5, dpr).pitch });
		await flush(page);
		expect(await page.locator('#chart').boundingBox()).toEqual(bounds);
		assertSpacing(await snapshot(page), 5, dpr);
	}
});
