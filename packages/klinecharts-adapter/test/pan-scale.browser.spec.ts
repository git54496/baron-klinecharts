import { expect, test, type Page } from '@playwright/test';
import { loadScene } from './load-scene.js';

const scene = loadScene('minimal-valid.json');

async function setup(page: Page, scale: 'normal' | 'logarithm', reverse = false, manual = true) {
	await page.goto('/test/fixture.html');
	await page.evaluate(async ({ scene, scale, reverse, manual }) => {
		const { createEngine } = await import('/src/engine.ts');
		const { createEngineIdMap } = await import('/src/conversion/id-map.ts');
		const { applyPanes, overrideSceneYAxis } = await import('/src/conversion/panes.ts');
		const start = scene.data[0]!.timestamp;
		scene.data = Array.from({ length: 400 }, (_, i) => {
			const close = 30 + i * 0.7;
			return { timestamp: start + i * 86400000, open: close - 3, close, low: close - 6, high: close + 8, volume: 1000 };
		});
		const handle = await createEngine(document.querySelector<HTMLElement>('#chart')!, scene);
		const chart = handle.chart;
		scene.panes[0]!.yAxes[0]!.scale = scale === 'logarithm' ? 'logarithmic' : 'linear';
		scene.panes[0]!.yAxes[0]!.reverse = reverse;
		const idMap = createEngineIdMap(scene, chart);
		applyPanes(scene, chart, idMap);
		chart.setBarSpace(8);
		chart.scrollToDataIndex(310);
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		const axis = chart.getYAxes({})[0]!;
		if (manual) (axis as typeof axis & { setRange(range: unknown): void }).setRange({ ...axis.getRange() });
		(window as any).__pan = { chart, axis, start, scene, idMap, overrideSceneYAxis };
	}, { scene: structuredClone(scene), scale, reverse, manual });
}

async function snapshot(page: Page) {
	return page.evaluate(() => {
		const { chart, axis, start } = (window as any).__pan;
		return {
			range: { ...axis.getRange() }, auto: axis.getAutoCalcTickFlag(),
			barSpace: chart.getBarSpace(),
			ticks: structuredClone(axis.getTicks()),
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
						const shared = before.ticks.filter((tick: any) => after.ticks.some((next: any) => next.value === tick.value));
						expect(shared.length).toBeGreaterThan(2);
						for (const tick of shared) {
							const next = after.ticks.find((next: any) => next.value === tick.value);
							expect(next.text).toBe(tick.text);
							expect(Math.abs(next.coord - tick.coord - dy!)).toBeLessThanOrEqual(1);
						}
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

test('@browser logarithmic grid stays aligned through a price-range threshold and scale switches', async ({ page }) => {
	await setup(page, 'logarithm');
	await page.evaluate(() => {
		const { chart, axis } = (window as any).__pan;
		const from = 60, to = 480;
		const realFrom = Math.log10(from), realTo = Math.log10(to);
		axis.setRange({ from, to, range: to - from, realFrom, realTo, realRange: realTo - realFrom,
			displayFrom: from, displayTo: to, displayRange: to - from });
		chart.resize();
	});
	const before = await snapshot(page);
	for (const dy of [60, 60, -120]) {
		const previous = await snapshot(page);
		await drag(page, 0, dy);
		const next = await snapshot(page);
		const common = previous.ticks.filter((tick: any) => next.ticks.some((other: any) => other.value === tick.value));
		expect(common.length).toBeGreaterThan(3);
		for (const tick of common) {
			const moved = next.ticks.find((other: any) => other.value === tick.value);
			expect(moved.text).toBe(tick.text);
			expect(Math.abs(moved.coord - tick.coord - dy)).toBeLessThanOrEqual(1);
		}
		const errors = await page.evaluate(() => {
			const { chart, axis } = (window as any).__pan;
			return axis.getTicks().map((tick: any) => Math.abs(tick.coord - chart.convertToPixel({ value: Number(tick.value) }).y));
		});
		expect(Math.max(...errors)).toBeLessThanOrEqual(1);
	}
	expect((await snapshot(page)).ticks).toEqual(before.ticks);
	for (const scale of ['linear', 'logarithmic']) {
		await page.evaluate(async (scale) => {
			const state = (window as any).__pan;
			const pane = state.scene.panes[0];
			state.overrideSceneYAxis(state.chart, state.idMap, { ...pane.yAxes[0], scale }, pane.id, '/panes/0/yAxes/0', true);
			await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
			state.axis = state.chart.getYAxes({})[0];
		}, scale);
		const { ticks } = await snapshot(page);
		expect(ticks.length).toBeGreaterThan(3);
		const values = ticks.map((tick: any) => Number(tick.value));
		const steps = values.slice(1).map((value: number, index: number) => scale === 'linear'
			? value - values[index] : Math.log10(value / values[index]));
		for (const step of steps) expect(step).toBeCloseTo(steps[0], 8);
	}
});

test('@browser disabled scrolling leaves the viewport unchanged', async ({ page }) => {
	await setup(page, 'logarithm');
	await page.evaluate(() => (window as any).__pan.chart.setScrollEnabled(false));
	const before = await snapshot(page);
	await drag(page, 100, 40);
	expect(await snapshot(page)).toEqual(before);
});
