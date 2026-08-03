import { TimeSeriesSceneError } from '@baron1996/kline-scene-schema';
import {
	chromium,
	type Browser,
	type LaunchOptions,
} from 'playwright';

type ChromiumLauncher = (options: LaunchOptions) => Promise<Browser>;

export interface TimeSeriesBridgePage {
	waitForFunction(
		callback: () => boolean,
		options?: { readonly timeout?: number },
	): Promise<unknown>;
	evaluate(callback: () => unknown): Promise<unknown>;
}

function renderFailed(): TimeSeriesSceneError {
	return new TimeSeriesSceneError(
		'TIME_SERIES_RENDER_FAILED',
		'/render',
		'Time Series browser rendering failed.',
	);
}

/** 启动 Time Series 渲染使用的 Playwright 1.61.0 固定 Chromium。 */
export async function launchPinnedTimeSeriesChromium(
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
			throw new TimeSeriesSceneError(
				'TIME_SERIES_BROWSER_NOT_INSTALLED',
				'/render',
				'Pinned Playwright Chromium is not installed.',
			);
		}
		throw renderFailed();
	}
}

/** 在同一个 deadline 内等待桥接对象出现并完成 Runtime 初始化。 */
export async function waitForTimeSeriesBridgeReady(
	page: TimeSeriesBridgePage,
	timeoutMs: number,
): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			(async () => {
				await page.waitForFunction(
					() => typeof window.__BARON_KLINE_SCENE__ !== 'undefined',
					{ timeout: 0 },
				);
				await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);
			})(),
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					reject(new TimeSeriesSceneError(
						'TIME_SERIES_RENDER_TIMEOUT',
						'/render',
						`Time Series rendering did not finish within ${timeoutMs}ms.`,
					));
				}, timeoutMs);
			}),
		]);
	} catch (error) {
		if (
			error instanceof TimeSeriesSceneError &&
			error.code === 'TIME_SERIES_RENDER_TIMEOUT'
		) {
			throw error;
		}
		throw renderFailed();
	} finally {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		}
	}
}
