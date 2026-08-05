import type {
	ChartScene,
	DrawableWorkspaceDocument,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';
import { parseDrawableWorkspaceDocument } from '@baron1996/kline-scene-schema';
import { writeFile } from 'node:fs/promises';

import { buildDrawableWorkspaceStandaloneHtml } from './drawable-workspace-html.js';
import { launchPinnedChromium } from './png.js';
import { canonicalizePng } from './png-codec.js';

async function waitForWorkspaceBridgeReady(
	page: import('playwright').Page,
	timeoutMs: number,
): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.ready),
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					reject(
						new Error(
							`DrawableWorkspace rendering did not finish within ${timeoutMs}ms.`,
						),
					);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		}
	}
}

/** 使用同一离线 Runtime 渲染确定性 Workspace PNG，不自绘 Canvas。 */
export async function renderDrawableWorkspacePng(
	workspace: unknown,
	outputPath: string,
): Promise<void> {
	const parsed = parseDrawableWorkspaceDocument(workspace);
	const scene = parsed.scene.document;
	const render = (scene as ChartScene).render ?? (scene as TimeSeriesScene).render;
	const chart = (scene as ChartScene).chart ?? (scene as TimeSeriesScene).chart;
	const browser = await launchPinnedChromium();
	try {
		const context = await browser.newContext({
			viewport: {
				width: render.width,
				height: render.height,
			},
			deviceScaleFactor: render.deviceScaleFactor,
			locale: chart.locale,
			timezoneId: chart.timezone,
			offline: true,
			serviceWorkers: 'block',
			reducedMotion: 'reduce',
		});
		try {
			const page = await context.newPage();
			await page.setContent(buildDrawableWorkspaceStandaloneHtml(parsed), {
				waitUntil: 'load',
			});
			await page.waitForFunction(
				() => typeof window.__BARON_DRAWABLE_WORKSPACE__ !== 'undefined',
			);
			await waitForWorkspaceBridgeReady(page, render.timeoutMs);
			const screenshot = await page
				.locator('[data-baron-render-root]')
				.screenshot({
					type: 'png',
					animations: 'disabled',
					caret: 'hide',
					scale: 'device',
				});
			await writeFile(outputPath, canonicalizePng(screenshot));
			await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.destroy());
		} finally {
			await context.close();
		}
	} finally {
		await browser.close();
	}
}

export type { DrawableWorkspaceDocument };
