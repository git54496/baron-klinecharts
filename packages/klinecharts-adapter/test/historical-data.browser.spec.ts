import { expect, test } from '@playwright/test';

const chartWorkspace = JSON.parse(
	await readFixture('workspaces/chart-minimal.json'),
);

async function readFixture(path: string): Promise<string> {
	const { readFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	return readFile(join(process.cwd(), '..', '..', 'tests', 'fixtures', path), 'utf8');
}

test('@browser earlier data keeps the visible timestamp at the same pixel', async ({ page }) => {
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

	const result = await page.evaluate(() => {
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
		const referenceTimestamp = request.beforeTimestamp + 40 * 86_400_000;
		const referenceValue = 10.4;
		const beforeX = adapter.projectToPixel(
			{ timestamp: referenceTimestamp, value: referenceValue },
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
			{ timestamp: referenceTimestamp, value: referenceValue },
			'candle',
		).x!;
		return {
			addedCount: committed.addedCount,
			dataCount: adapter.inspect().dataCount,
			pixelDelta: Math.abs(afterX - beforeX),
		};
	});
	expect(result.addedCount).toBe(100);
	expect(result.dataCount).toBe(420);
	expect(result.pixelDelta).toBeLessThan(0.5);
});
