import { expect, test } from '@playwright/test';

import { buildStandaloneHtml } from '@baron1996/klinecharts-render-runtime';

import { loadScene } from './helpers.js';

test('standalone HTML loads, edits, and exports with every network request blocked', async ({ page }) => {
	const requests: string[] = [];
	await page.route('**/*', async (route) => {
		requests.push(route.request().url());
		await route.abort();
	});
	await page.setContent(buildStandaloneHtml(await loadScene('minimal-valid.json')), {
		waitUntil: 'load',
	});
	await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);
	await page.locator('[data-action="overlay-text"]').fill('离线中文标注');
	await page.locator('[data-overlay-type="text"]').click();
	const canvas = page.locator('[data-baron-render-root] canvas').nth(1);
	await canvas.click({ position: { x: 400, y: 260 } });
	await expect.poll(() => page.evaluate(
		() => window.__BARON_KLINE_SCENE__.exportScene().overlays.length,
	)).toBe(1);
	const exported = await page.evaluate(() => window.__BARON_KLINE_SCENE__.exportScene());
	expect(exported.overlays[0]?.text).toBe('离线中文标注');
	expect(requests).toEqual([]);
});
