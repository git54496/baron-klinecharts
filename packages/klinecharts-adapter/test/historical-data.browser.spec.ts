import { expect, test } from '@playwright/test';

const chartWorkspace = JSON.parse(
	await readFixture('workspaces/chart-minimal.json'),
);

async function readFixture(path: string): Promise<string> {
	const { readFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	return readFile(join(process.cwd(), '..', '..', 'tests', 'fixtures', path), 'utf8');
}

test('@browser period replacement never requests old-period history at a zoomed-out boundary', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (sourceWorkspace) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const workspace = structuredClone(sourceWorkspace);
		const day = 86_400_000;
		const last = Date.UTC(2026, 9, 5);
		const bars = (count: number, step: number) => Array.from({ length: count }, (_, index) => ({
			timestamp: last - (count - index - 1) * step,
			open: 70, high: 72, low: 69, close: 71, volume: 1000,
		}));
		const weekly = workspace.scene.document;
		weekly.period = { type: 'week', span: 1 };
		weekly.data = bars(260, 7 * day);
		weekly.viewport = { ...weekly.viewport, barSpace: 8, anchorTimestamp: last };
		const adapter = await KLineChartsSceneAdapter.createWorkspace(
			document.querySelector<HTMLElement>('#chart')!, workspace,
			{ historicalDataLoading: { hasMore: true } },
		);
		const requests: Array<{ requestId: string; beforeTimestamp: number; period: { type: string } }> = [];
		adapter.subscribeHistoricalDataRequests((request) => requests.push(request));
		const daily = structuredClone(weekly);
		daily.period = { type: 'day', span: 1 };
		daily.data = bars(275, day);
		const button = document.createElement('button');
		button.textContent = 'Switch to daily';
		button.onclick = () => {
			requests.length = 0;
			adapter.replaceScene(daily);
		};
		document.body.prepend(button);
		const reverse = document.createElement('button');
		reverse.textContent = 'Switch to weekly';
		reverse.onclick = () => { requests.length = 0; adapter.replaceScene(weekly); };
		document.body.prepend(reverse);
		Object.assign(window, { __adapter: adapter, __requests: requests, __daily: daily });
	}, chartWorkspace);

	// The old loader's 260-week snapshot fits in view and requests history
	// synchronously when setSymbol/setPeriod reset it during replacement.
	await page.mouse.move(500, 280);
	for (let index = 0; index < 24; index += 1) await page.mouse.wheel(0, 120);
	await expect.poll(() => page.evaluate(() => (window as any).__requests.length)).toBeGreaterThan(0);
	const staleId = await page.evaluate(() => (window as any).__requests[0].requestId);
	await page.getByRole('button', { name: 'Switch to daily' }).click();
	const result = await page.evaluate((staleRequestId) => {
		const { __adapter: adapter, __requests: requests, __daily: daily } = window as any;
		let staleRejected = false;
		try {
			adapter.commitHistoricalData(staleRequestId, [{
				timestamp: Date.UTC(2016, 9, 17), open: 10, high: 12, low: 9, close: 11,
			}], false);
		} catch { staleRejected = true; }
		return { requests, staleRejected, scene: adapter.exportScene(), expected: daily.data };
	}, staleId);
	expect(result.staleRejected).toBe(true);
	expect(result.requests.every((request: any) => request.period.type === 'day')).toBe(true);
	expect(result.requests.every((request: any) => request.beforeTimestamp === result.expected[0].timestamp)).toBe(true);
	expect(result.scene.data).toEqual(result.expected);

	for (let index = 0; index < 4; index += 1) {
		await page.mouse.move(120, 280);
		await page.mouse.down();
		await page.mouse.move(900, 280, { steps: 12 });
		await page.mouse.up();
	}
	await expect.poll(() => page.evaluate(() => (window as any).__requests.some(
		(request: any) => request.period.type === 'day' && request.beforeTimestamp === (window as any).__daily.data[0].timestamp,
	))).toBe(true);
	const dailyRequestId = await page.evaluate(() => (window as any).__requests.at(-1).requestId);
	const added = await page.evaluate((requestId) => {
		const { __adapter: adapter, __daily: daily } = window as any;
		return adapter.commitHistoricalData(requestId, [{
			...daily.data[0], timestamp: daily.data[0].timestamp - 86_400_000,
		}], true).addedCount;
	}, dailyRequestId);
	expect(added).toBe(1);
	await page.getByRole('button', { name: 'Switch to weekly' }).click();
	expect(await page.evaluate(() => {
		const { __adapter: adapter, __requests: requests } = window as any;
		return { period: adapter.exportScene().period.type, count: adapter.inspect().dataCount,
			wrongRequests: requests.filter((request: any) => request.period.type !== 'week').length };
	})).toEqual({ period: 'week', count: 260, wrongRequests: 0 });
});

test('@browser earlier data locks pending scroll and keeps the visible timestamp at the same pixel', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (sourceWorkspace) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const workspace = structuredClone(sourceWorkspace);
		const lastTimestamp = workspace.scene.document.data.at(-1).timestamp;
		workspace.scene.document.data = Array.from({ length: 320 }, (_, index) => {
			const timestamp = lastTimestamp - (319 - index) * 86_400_000;
			const close = 10 + index / 100;
			return {
				timestamp,
				open: close - 0.05,
				high: close + 0.1,
				low: close - 0.1,
				close,
				volume: 1_000 + index,
			};
		});
		workspace.scene.document.viewport.anchorTimestamp = lastTimestamp;
		const container = document.querySelector<HTMLElement>('#chart')!;
		const adapter = await KLineChartsSceneAdapter.createWorkspace(
			container,
			workspace,
			{ historicalDataLoading: { hasMore: true } },
		);
		const requests: Array<{
			requestId: string;
			beforeTimestamp: number;
		}> = [];
		adapter.subscribeHistoricalDataRequests((request) => requests.push(request));
		(window as unknown as Record<string, unknown>).__adapter = adapter;
		(window as unknown as Record<string, unknown>).__requests = requests;
	}, chartWorkspace);

	for (let attempt = 0; attempt < 4; attempt += 1) {
		await page.mouse.move(120, 280);
		await page.mouse.down();
		await page.mouse.move(900, 280, { steps: 12 });
		await page.mouse.up();
	}
	await expect.poll(() => page.evaluate(() => (
		(window as unknown as { __requests: readonly unknown[] }).__requests.length
	))).toBe(1);

	const pendingReference = await page.evaluate(() => {
		const adapter = (window as unknown as {
			__adapter: {
				projectToPixel(anchor: unknown, paneRole: string): { readonly x?: number };
			};
			__requests: Array<{ readonly beforeTimestamp: number }>;
		}).__adapter;
		const request = (window as unknown as {
			__requests: Array<{ readonly beforeTimestamp: number }>;
		}).__requests[0]!;
		const timestamp = request.beforeTimestamp + 40 * 86_400_000;
		const value = 10.4;
		return {
			timestamp,
			value,
			x: adapter.projectToPixel({ timestamp, value }, 'candle').x!,
		};
	});

	await page.mouse.move(120, 280);
	await page.mouse.down();
	await page.mouse.move(900, 280, { steps: 12 });
	await page.mouse.up();

	const result = await page.evaluate((reference) => {
		const adapter = (window as unknown as {
			__adapter: {
				projectToPixel(anchor: unknown, paneRole: string): { readonly x?: number };
				commitHistoricalData(
					requestId: string,
					data: readonly unknown[],
					hasMore: boolean,
				): { readonly addedCount: number };
				inspect(): { readonly dataCount: number };
			};
			__requests: Array<{ readonly requestId: string; readonly beforeTimestamp: number }>;
		}).__adapter;
		const request = (window as unknown as {
			__requests: Array<{ readonly requestId: string; readonly beforeTimestamp: number }>;
		}).__requests[0]!;
		const pendingX = adapter.projectToPixel(
			{ timestamp: reference.timestamp, value: reference.value },
			'candle',
		).x!;
		const page = Array.from({ length: 100 }, (_, index) => {
			const timestamp = request.beforeTimestamp - (100 - index) * 86_400_000;
			const close = 9 + index / 100;
			return {
				timestamp,
				open: close - 0.05,
				high: close + 0.1,
				low: close - 0.1,
				close,
				volume: 500 + index,
			};
		});
		const committed = adapter.commitHistoricalData(request.requestId, page, false);
		const afterX = adapter.projectToPixel(
			{ timestamp: reference.timestamp, value: reference.value },
			'candle',
		).x!;
		return {
			addedCount: committed.addedCount,
			dataCount: adapter.inspect().dataCount,
			pendingDragPixelDelta: Math.abs(pendingX - reference.x),
			commitPixelDelta: Math.abs(afterX - reference.x),
		};
	}, pendingReference);
	expect(result.addedCount).toBe(100);
	expect(result.dataCount).toBe(420);
	expect(result.pendingDragPixelDelta).toBeLessThan(0.5);
	expect(result.commitPixelDelta).toBeLessThan(0.5);

	await page.mouse.move(500, 280);
	await page.mouse.down();
	await page.mouse.move(400, 280, { steps: 12 });
	await page.mouse.up();
	const restoredX = await page.evaluate((reference) => {
		const adapter = (window as unknown as {
			__adapter: {
				projectToPixel(anchor: unknown, paneRole: string): { readonly x?: number };
			};
		}).__adapter;
		return adapter.projectToPixel(
			{ timestamp: reference.timestamp, value: reference.value },
			'candle',
		).x!;
	}, pendingReference);
	expect(Math.abs(restoredX - pendingReference.x)).toBeGreaterThan(1);
});

test('@browser Gap-aware earlier bars render after a native prepend and explicit price fit', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (sourceWorkspace) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const workspace = structuredClone(sourceWorkspace);
		const scene = workspace.scene.document;
		const lastTimestamp = scene.data.at(-1).timestamp;
		scene.version = 2;
		scene.gaps = [];
		scene.data = Array.from({ length: 320 }, (_, index) => {
			const timestamp = lastTimestamp - (319 - index) * 86_400_000;
			const close = 20 + index / 100;
			return {
				timestamp,
				open: close + 0.12,
				high: close + 0.2,
				low: close - 0.1,
				close,
				volume: 1_000 + index,
			};
		});
		scene.viewport.anchorTimestamp = lastTimestamp;
		const container = document.querySelector<HTMLElement>('#chart')!;
		const adapter = await KLineChartsSceneAdapter.createWorkspace(
			container,
			workspace,
			{ historicalDataLoading: { hasMore: true } },
		);
		const requests: Array<{
			requestId: string;
			beforeTimestamp: number;
		}> = [];
		adapter.subscribeHistoricalDataRequests((request) => requests.push(request));
		(window as unknown as Record<string, unknown>).__adapter = adapter;
		(window as unknown as Record<string, unknown>).__requests = requests;
	}, chartWorkspace);

	for (let attempt = 0; attempt < 4; attempt += 1) {
		await page.mouse.move(120, 280);
		await page.mouse.down();
		await page.mouse.move(900, 280, { steps: 12 });
		await page.mouse.up();
	}
	await expect.poll(() => page.evaluate(() => (
		(window as unknown as { __requests: readonly unknown[] }).__requests.length
	))).toBe(1);

	const committed = await page.evaluate(() => {
		const adapter = (window as unknown as {
			__adapter: {
				commitHistoricalData(
					requestId: string,
					data: readonly unknown[],
					hasMore: boolean,
				): { readonly addedCount: number };
			};
			__requests: Array<{ readonly requestId: string; readonly beforeTimestamp: number }>;
		}).__adapter;
		const request = (window as unknown as {
			__requests: Array<{ readonly requestId: string; readonly beforeTimestamp: number }>;
		}).__requests[0]!;
		const page = Array.from({ length: 100 }, (_, index) => {
			const timestamp = request.beforeTimestamp - (100 - index) * 86_400_000;
			const close = 18 + index / 100;
			return {
				timestamp,
				open: close - 0.12,
				high: close + 0.2,
				low: close - 0.2,
				close,
				volume: 500 + index,
			};
		});
		return adapter.commitHistoricalData(request.requestId, page, false);
	});
	expect(committed.addedCount).toBe(100);

	for (let attempt = 0; attempt < 2; attempt += 1) {
		await page.mouse.move(120, 280);
		await page.mouse.down();
		await page.mouse.move(900, 280, { steps: 12 });
		await page.mouse.up();
	}
	await page.evaluate(() => new Promise<void>((resolve) => (
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	)));

	// Panning now deliberately keeps the original price scale. These older bars
	// trade below that range; explicitly fit Y before checking their rendered pixels.
	await page.mouse.dblclick(980, 280);
	await page.evaluate(() => new Promise<void>((resolve) => (
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	)));
	const historicalUpPixels = await page.evaluate((color) => {
		const rgb = color.match(/\d+/gu)!.slice(0, 3).map(Number);
		let count = 0;
		for (const canvas of document.querySelectorAll<HTMLCanvasElement>('#chart canvas')) {
			if (canvas.width === 0 || canvas.height === 0) continue;
			const context = canvas.getContext('2d');
			if (context === null) continue;
			const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
			for (let index = 0; index < pixels.length; index += 4) {
				if (
					pixels[index] === rgb[0]
					&& pixels[index + 1] === rgb[1]
					&& pixels[index + 2] === rgb[2]
					&& pixels[index + 3]! > 0
				) {
					count += 1;
				}
			}
		}
		return count;
	}, chartWorkspace.scene.document.chart.candle.upColor);
	expect(historicalUpPixels).toBeGreaterThan(100);
});
