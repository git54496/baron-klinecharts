import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

test('Vanilla example loads and exports the deterministic static scene', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/examples/vanilla/');

	const status = page.locator('[data-example-status]');
	await expect(status).toHaveAttribute('data-state', 'ready');
	await expect(status).toContainText('250 根日 K');
	await expect(page.locator('#chart canvas').first()).toBeVisible();
	await expect(page.getByRole('toolbar', { name: 'K 线标注工具' })).toBeVisible();
	await expect(page.locator('[data-overlay-type]')).not.toHaveCount(0);

	const downloadPromise = page.waitForEvent('download');
	await page.locator('[data-action="export"]').click();
	const download = await downloadPromise;
	const downloadPath = await download.path();
	expect(downloadPath).not.toBeNull();
	const scene = JSON.parse(await readFile(downloadPath!, 'utf8')) as {
		symbol: { ticker: string; name: string };
		data: Array<{ timestamp: number }>;
		viewport: { anchorTimestamp: number };
	};

	expect(scene.symbol).toMatchObject({
		ticker: 'MOCK.CN',
		name: '确定性模拟行情',
	});
	expect(scene.data).toHaveLength(250);
	expect(scene.viewport.anchorTimestamp).toBe(scene.data.at(-1)?.timestamp);
	expect(pageErrors).toEqual([]);
});
