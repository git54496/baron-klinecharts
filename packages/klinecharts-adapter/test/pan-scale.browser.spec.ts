import { expect, test, type Page } from '@playwright/test';
import { loadScene } from './load-scene.js';

const scene = loadScene('minimal-valid.json');

async function setup(page: Page, scale: 'normal' | 'logarithm', reverse = false, manual = true) {
	await page.goto('/test/fixture.html');
	await page.evaluate(async ({ scene, scale, reverse, manual }) => {
		const { createEngine } = await import('/src/engine.ts');
		const start = scene.data[0]!.timestamp;
		scene.data = Array.from({ length: 400 }, (_, i) => {
			const close = 30 + i * 0.7;
			return { timestamp: start + i * 86400000, open: close - 3, close, low: close - 6, high: close + 8, volume: 1000 };
		});
		const handle = await createEngine(document.querySelector<HTMLElement>('#chart')!, scene);
		const chart = handle.chart;
		chart.overrideYAxis({ name: scale, reverse });
		chart.setBarSpace(8);
		chart.scrollToDataIndex(310);
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		const axis = chart.getYAxes({})[0]!;
		if (manual) (axis as typeof axis & { setRange(range: unknown): void }).setRange({ ...axis.getRange() });
		(window as any).__pan = { chart, axis, start };
	}, { scene: structuredClone(scene), scale, reverse, manual });
}

async function snapshot(page: Page) {
	return page.evaluate(() => {
		const { chart, axis, start } = (window as any).__pan;
		return {
			range: { ...axis.getRange() }, auto: axis.getAutoCalcTickFlag(),
			barSpace: chart.getBarSpace(),
			points: [250, 260, 270].map((index) => chart.convertToPixel({ timestamp: start + index * 86400000, value: 30 + index * 0.7 })),
		};
	});
}

async function drag(page: Page, dx: number, dy: number) {
	await page.mouse.move(450, 300);
	await page.mouse.down();
	await page.mouse.move(450 + dx, 300 + dy, { steps: 10 });
	await page.mouse.up();
	await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

for (const scale of ['normal', 'logarithm'] as const) {
	for (const reverse of [false, true]) {
		for (const manual of [false, true]) {
			test(`@browser pan preserves ${scale} scale reverse=${reverse} manual=${manual}`, async ({ page }) => {
				await setup(page, scale, reverse, manual);
				for (const [dx, dy] of [[120, 0], [-80, 45], [0, -60], [-40, 15]]) {
					const before = await snapshot(page);
					await drag(page, dx!, dy!);
					const after = await snapshot(page);
					expect(after.barSpace).toEqual(before.barSpace);
					expect(after.range.realRange).toBeCloseTo(before.range.realRange, 10);
					if (scale === 'logarithm') {
						expect(after.range.to / after.range.from).toBeCloseTo(before.range.to / before.range.from, 10);
					} else {
						expect(after.range.range).toBeCloseTo(before.range.range, 10);
					}
					for (let i = 0; i < before.points.length; i++) {
						expect(after.points[i].x - before.points[i].x).toBeCloseTo(dx!, 0);
						expect(Math.abs(after.points[i].y - before.points[i].y - dy!)).toBeLessThanOrEqual(1);
					}
					expect(after.auto).toBe(false);
				}
			});
		}
	}
}

test('@browser click keeps auto-fit; Y-axis double click restores it after a pan', async ({ page }) => {
	await setup(page, 'logarithm', false, false);
	await page.mouse.click(450, 300);
	expect((await snapshot(page)).auto).toBe(true);
	await drag(page, 100, 40);
	expect((await snapshot(page)).auto).toBe(false);
	const point = await page.evaluate(() => {
		const { axis } = (window as any).__pan;
		const bounds = axis.getBounding();
		return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
	});
	await page.mouse.dblclick(point.x, point.y);
	expect((await snapshot(page)).auto).toBe(true);
});

test('@browser disabled scrolling leaves the viewport unchanged', async ({ page }) => {
	await setup(page, 'logarithm');
	await page.evaluate(() => (window as any).__pan.chart.setScrollEnabled(false));
	const before = await snapshot(page);
	await drag(page, 100, 40);
	expect(await snapshot(page)).toEqual(before);
});
