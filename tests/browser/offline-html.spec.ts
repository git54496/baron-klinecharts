import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
	buildDrawableWorkspaceStandaloneHtml,
	buildStandaloneHtml,
} from '@baron1996/klinecharts-render-runtime';

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

test('Workspace HTML loads with 22 tools, edits, and exports offline', async ({
	page,
}) => {
	const workspace = JSON.parse(
		await readFile(
			resolve('tests', 'fixtures', 'workspaces', 'chart-minimal.json'),
			'utf8',
		),
	);
	const requests: string[] = [];
	const directory = await mkdtemp(join(tmpdir(), 'baron-workspace-offline-'));
	const htmlPath = join(directory, 'workspace.html');
	await writeFile(
		htmlPath,
		buildDrawableWorkspaceStandaloneHtml(workspace),
		'utf8',
	);
	try {
		await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
		// 主文档从 file:// 加载后，再阻断一切后续请求并统计。
		await page.route('**/*', async (route) => {
			requests.push(route.request().url());
			await route.abort();
		});
		await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.ready);
		expect(await page.locator('[data-overlay-type]').count()).toBe(22);
		await page.locator('[data-overlay-type="horizontalStraightLine"]').click();
		await page.locator('[data-baron-render-root] canvas').nth(1)
			.click({ position: { x: 400, y: 120 } });
		await expect.poll(() => page.evaluate(
			() => window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace()
				.drawings.drawings.length,
		)).toBe(23);
		const exported = await page.evaluate(
			() => window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace(),
		);
		expect(exported.schema).toBe('@baron1996/drawable-workspace');
		expect(exported.scene.kind).toBe('chart');
		expect(requests).toEqual([]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('raw Scene HTML does not expose the Workspace bridge', async ({ page }) => {
	await page.route('**/*', async (route) => {
		await route.abort();
	});
	await page.setContent(buildStandaloneHtml(await loadScene('minimal-valid.json')), {
		waitUntil: 'load',
	});
	await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);
	expect(await page.evaluate(
		() => typeof window.__BARON_DRAWABLE_WORKSPACE__,
	)).toBe('undefined');
});
