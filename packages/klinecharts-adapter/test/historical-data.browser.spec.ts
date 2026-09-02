import { expect, test } from '@playwright/test';

const chartWorkspace = JSON.parse(
	await readFixture('workspaces/chart-minimal.json'),
);

async function readFixture(path: string): Promise<string> {
	const { readFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	return readFile(join(process.cwd(), '..', '..', 'tests', 'fixtures', path), 'utf8');
}

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
