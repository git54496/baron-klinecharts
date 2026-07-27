import {
	parseChartScene,
	SceneError,
} from '@baron1996/kline-scene-schema';
import { writeFile } from 'node:fs/promises';
import {
	chromium,
	type Browser,
	type LaunchOptions,
} from 'playwright';

import { buildStandaloneHtml } from './html.js';
import { canonicalizePng } from './png-codec.js';

type ChromiumLauncher = (options: LaunchOptions) => Promise<Browser>;

/** 启动 Playwright 1.61.0 固定 revision 的 Chromium。 */
export async function launchPinnedChromium(
	launch: ChromiumLauncher = (options) => chromium.launch(options),
): Promise<Browser> {
	try {
		return await launch({ headless: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (
			/executable.*(?:doesn't exist|not found)|browser.*not installed|playwright install/iu.test(
				message,
			)
		) {
			throw new SceneError(
				'BROWSER_NOT_INSTALLED',
				'/render',
				'Pinned Playwright Chromium is not installed. Run the CLI install-browser command.',
			);
		}
		throw error;
	}
}

async function waitForBridgeReady(
	page: import('playwright').Page,
	timeoutMs: number,
): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			page.evaluate(() => window.__BARON_KLINE_SCENE__.ready),
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					reject(
						new SceneError(
							'RENDER_TIMEOUT',
							'/render/timeoutMs',
							`Scene rendering did not finish within ${timeoutMs}ms.`,
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

/** 使用唯一的自包含浏览器 Runtime 渲染确定性 PNG。 */
export async function renderScenePng(
	scene: unknown,
	outputPath: string,
): Promise<void> {
	const parsed = parseChartScene(scene);
	const browser = await launchPinnedChromium();
	try {
		const context = await browser.newContext({
			viewport: {
				width: parsed.render.width,
				height: parsed.render.height,
			},
			deviceScaleFactor: parsed.render.deviceScaleFactor,
			locale: parsed.chart.locale,
			timezoneId: parsed.chart.timezone,
			offline: true,
			serviceWorkers: 'block',
			reducedMotion: 'reduce',
		});
		try {
			const page = await context.newPage();
			await page.setContent(buildStandaloneHtml(parsed), {
				waitUntil: 'load',
			});
			await page.waitForFunction(
				() => typeof window.__BARON_KLINE_SCENE__ !== 'undefined',
			);
			await waitForBridgeReady(page, parsed.render.timeoutMs);
			const screenshot = await page.locator('[data-baron-render-root]').screenshot({
				type: 'png',
				animations: 'disabled',
				caret: 'hide',
				scale: 'device',
			});
			await writeFile(outputPath, canonicalizePng(screenshot));
			await page.evaluate(() => window.__BARON_KLINE_SCENE__.destroy());
		} finally {
			await context.close();
		}
	} finally {
		await browser.close();
	}
}
