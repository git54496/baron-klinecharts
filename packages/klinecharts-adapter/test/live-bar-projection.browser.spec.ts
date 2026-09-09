import { expect, test } from '@playwright/test';

const chartWorkspace = JSON.parse(
	await readFixture('workspaces/chart-minimal.json'),
);

async function readFixture(path: string): Promise<string> {
	const { readFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	return readFile(join(process.cwd(), '..', '..', 'tests', 'fixtures', path), 'utf8');
}

test('@browser live bars stay outside exported Scene and support previous reconciliation', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (sourceWorkspace) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const workspace = structuredClone(sourceWorkspace);
		const container = document.querySelector<HTMLElement>('#chart')!;
		const adapter = await KLineChartsSceneAdapter.createWorkspace(container, workspace);
		const before = adapter.exportScene();
		const latest = before.data.at(-1)!;
		const current = { ...latest, close: latest.close + 0.1 };
		const appended = {
			...latest,
			timestamp: latest.timestamp + 86_400_000,
			open: latest.close,
			high: latest.close + 0.4,
			low: latest.close - 0.2,
			close: latest.close + 0.2,
		};
		const currentResult = adapter.projectLiveBar(current);
		const appendResult = adapter.projectLiveBar(appended);
		const viewportBeforeReconcile = adapter.inspect();
		const reconcileResult = adapter.projectLiveBar({
			...current,
			close: current.close + 0.05,
		});
		const viewportAfterReconcile = adapter.inspect();
		const projectedX = adapter.projectToPixel(
			{ timestamp: appended.timestamp, value: appended.close },
			'candle',
		).x;
		let unknownRejected = false;
		try {
			adapter.projectLiveBar({ ...latest, timestamp: latest.timestamp - 86_400_000 });
		} catch {
			unknownRejected = true;
		}
		const exported = adapter.exportScene();
		const cleared = adapter.clearLiveBarProjection();
		return {
			currentResult,
			appendResult,
			reconcileResult,
			projectedX,
			unknownRejected,
			exportUnchanged: JSON.stringify(exported) === JSON.stringify(before),
			cleared,
			secondClear: adapter.clearLiveBarProjection(),
			barSpaceBefore: viewportBeforeReconcile.barSpace,
			barSpaceAfter: viewportAfterReconcile.barSpace,
			rightOffsetBefore: viewportBeforeReconcile.rightOffsetDistance,
			rightOffsetAfter: viewportAfterReconcile.rightOffsetDistance,
		};
	}, chartWorkspace);

	expect(result.currentResult.action).toBe('replaced_current');
	expect(result.appendResult.action).toBe('appended');
	expect(result.reconcileResult.action).toBe('reconciled_previous');
	expect(result.projectedX).toEqual(expect.any(Number));
	expect(result.unknownRejected).toBe(true);
	expect(result.exportUnchanged).toBe(true);
	expect(result.cleared).toBe(true);
	expect(result.secondClear).toBe(false);
	expect(result.barSpaceAfter).toBe(result.barSpaceBefore);
	expect(result.rightOffsetAfter).toBe(result.rightOffsetBefore);
});
