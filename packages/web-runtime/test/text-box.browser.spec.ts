import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
test.use({ hasTouch: true });
const fixture = JSON.parse(await readFile(new URL('../../../tests/fixtures/workspaces/chart-minimal.json', import.meta.url), 'utf8'));
test('@browser text records period, resizes corners, collapses across periods and persists', async ({ page }, testInfo) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto('/test/fixture.html');
	await page.evaluate(async (fixture) => {
		const { createDrawableWorkspaceRuntime, createDrawingFloatingToolbar } = await import('/src/index.ts');
		const workspace = structuredClone(fixture), scene = workspace.scene.document;
		scene.period = { type: 'hour', span: 2 };
		const first = scene.data[0].timestamp;
		scene.data = Array.from({ length: 100 }, (_, i) => ({ timestamp: first + i * 7200000, open: 100, close: 101, high: 105, low: 95, volume: 1000 }));
		scene.viewport = { barSpace: 30, rightOffsetDistance: 80, anchorTimestamp: scene.data.at(-1).timestamp };
		workspace.drawings.drawings = [];
		const runtime = await createDrawableWorkspaceRuntime(document.querySelector<HTMLElement>('#chart')!, workspace, { commitMode: 'immediate', drawingInteraction: { exclusiveSelection: true } });
		createDrawingFloatingToolbar(document.querySelector<HTMLElement>('#chart')!, runtime);
		Object.assign(window, { __runtime: runtime, __hourScene: structuredClone(scene) });
		runtime.startDrawing('text', { id: 'period-text', text: '震荡区间下沿，加仓', metadata: { baronTextPeriod: { type: 'hour', span: 2 } } });
	}, fixture);
	await page.locator('#chart canvas').nth(1).click({ position: { x: 500, y: 220 } });
	await expect.poll(() => page.evaluate(() => (window as any).__runtime.listDrawings().length)).toBe(1);
	await page.evaluate(() => (window as any).__runtime.selectDrawing('period-text'));
	await expect(page.locator('[data-action="drawing-text"]')).toHaveValue('震荡区间下沿，加仓');
	await expect(page.locator('[data-action="text-period"]')).toHaveValue('hour:2');
	await expect(page.locator('[data-drawing-selection-anchors] circle')).toHaveCount(4);
	const before = await page.evaluate(() => (window as any).__runtime.getDrawing('period-text'));
	expect(before.geometry.point.granularity).toEqual({ type: 'hour', span: 2 });
	expect(before.metadata.baronTextBox.width).toBeGreaterThan(80);
	const corner = await page.locator('[data-drawing-selection-anchors] circle[data-anchor-index="2"]').boundingBox();
	await page.mouse.move(corner!.x + corner!.width / 2, corner!.y + corner!.height / 2);
	await page.mouse.down();
	await page.mouse.move(corner!.x + 55, corner!.y - 15, { steps: 5 });
	await page.mouse.up();
	await expect.poll(() => page.evaluate(() => (window as any).__runtime.getDrawing('period-text').metadata.baronTextBox.end.timestamp)).not.toBe(before.metadata.baronTextBox.end.timestamp);
	const afterResize = await page.evaluate(() => (window as any).__runtime.getDrawing('period-text'));
	await page.locator('[data-action="text-period"]').selectOption('week:1');
	await expect.poll(() => page.evaluate(() => (window as any).__runtime.getDrawing('period-text').metadata.baronTextPeriod)).toEqual({ type: 'week', span: 1 });
	expect(await page.evaluate(() => (window as any).__runtime.getDrawing('period-text').geometry)).toEqual(afterResize.geometry);
	await page.locator('[data-action="text-period"]').selectOption('hour:2');
	await expect.poll(() => page.evaluate(() => (window as any).__runtime.getDrawing('period-text').metadata.baronTextPeriod)).toEqual({ type: 'hour', span: 2 });
	const persisted = await page.evaluate(() => (window as any).__runtime.exportDrawingDocument());
	await page.evaluate(() => {
		const runtime = (window as any).__runtime, scene = structuredClone((window as any).__hourScene), first = scene.data[0].timestamp;
		scene.period = { type: 'day', span: 1 };
		scene.data = Array.from({ length: 9 }, (_, i) => ({ ...scene.data[0], timestamp: first + i * 86400000 }));
		scene.viewport.anchorTimestamp = scene.data.at(-1).timestamp;
		runtime.replaceScene(scene);
		runtime.selectDrawing(null);
	});
	await expect(page.locator('[data-drawing-selection-anchors] circle')).toHaveCount(0);
	const hit = await page.evaluate(() => {
		const runtime = (window as any).__runtime;
		for (let y = 60; y < 550; y += 4)
			for (let x = 60; x < 940; x += 4)
				if (runtime.hitTestDrawing({ x, y }) === 'period-text')
					return { x, y };
		throw new Error('Collapsed period circle is not selectable.');
	});
	await page.touchscreen.tap(hit.x + 10, hit.y + 10);
	await expect(page.locator('.baron-drawing-toolbar')).toBeVisible();
	await expect(page.locator('[data-action="text-period"]')).toHaveValue('hour:2');
	await expect(page.locator('[data-action="drawing-text"]')).toHaveValue('震荡区间下沿，加仓');
	await page.screenshot({ path: testInfo.outputPath('text-period-circle.png') });
	expect(await page.evaluate(() => (window as any).__runtime.exportDrawingDocument())).toEqual(persisted);
	await page.mouse.click(100, 500);
	await expect(page.locator('.baron-drawing-toolbar')).toBeHidden();
	await page.evaluate(() => (window as any).__runtime.replaceScene((window as any).__hourScene));
	await page.evaluate(() => (window as any).__runtime.selectDrawing('period-text'));
	await expect(page.locator('[data-drawing-selection-anchors] circle')).toHaveCount(4);
	await page.screenshot({ path: testInfo.outputPath('text-period-expanded.png') });
	expect(await page.evaluate(() => (window as any).__runtime.exportDrawingDocument())).toEqual(persisted);
	// A fresh runtime must reproduce the same bounds, period and content.
	await page.evaluate(async () => {
		const { createDrawableWorkspaceRuntime, createDrawingFloatingToolbar } = await import('/src/index.ts');
		const previous = (window as any).__runtime;
		const workspace = previous.exportWorkspace();
		previous.destroy();
		const runtime = await createDrawableWorkspaceRuntime(document.querySelector<HTMLElement>('#chart')!, workspace, { commitMode: 'immediate', drawingInteraction: { exclusiveSelection: true } });
		createDrawingFloatingToolbar(document.querySelector<HTMLElement>('#chart')!, runtime);
		(window as any).__runtime = runtime;
		runtime.selectDrawing('period-text');
	});
	await expect(page.locator('[data-drawing-selection-anchors] circle')).toHaveCount(4);
	await expect(page.locator('[data-action="text-period"]')).toHaveValue('hour:2');
	expect(await page.evaluate(() => (window as any).__runtime.exportDrawingDocument())).toEqual(persisted);
	for (const width of [1180, 795, 390]) {
		await page.setViewportSize({ width, height: 862 });
		await page.locator('[data-action="text-period"]').focus();
		await expect(page.locator('[data-action="text-period"]')).toBeFocused();
		const toolbarBounds = await page.locator('.baron-drawing-toolbar').boundingBox();
		expect(toolbarBounds!.x + toolbarBounds!.width).toBeLessThanOrEqual(width);
		const overflow = await page.locator('.baron-drawing-toolbar').evaluate(el => el.scrollWidth > el.clientWidth);
		expect(overflow).toBe(false);
	}
	expect(errors).toEqual([]);
});
