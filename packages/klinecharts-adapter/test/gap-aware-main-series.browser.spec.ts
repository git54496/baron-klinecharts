import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const base = loadScene('minimal-valid.json');
const start = base.data[0]!.timestamp;
const scene = {
	...base,
	version: 2,
	data: [
		{ timestamp: start, open: 10, high: 10.4, low: 9.8, close: 10.2, volume: 100 },
		{ timestamp: start + 60_000, open: 10.2, high: 10.5, low: 10, close: 10.4, volume: 100 },
		{ timestamp: start + 180_000, open: 10.4, high: 10.6, low: 10.1, close: 10.3, volume: 100 },
		{ timestamp: start + 360_000, open: 10.3, high: 10.7, low: 10.2, close: 10.6, volume: 100 },
	],
	gaps: [
		{ timestamp: start + 120_000, barEnd: start + 180_000, classification: 'SOURCE_ERROR', reasonCode: 'UPSTREAM_TIMEOUT', retryable: true },
		{ timestamp: start + 240_000, barEnd: start + 300_000, classification: 'UNKNOWN_MISSING', reasonCode: 'ALL_SOURCES_EMPTY', retryable: true },
		{ timestamp: start + 300_000, barEnd: start + 360_000, classification: 'UNKNOWN_MISSING', reasonCode: 'TRADE_EVIDENCE_UNAVAILABLE', retryable: true },
	],
	viewport: { ...base.viewport, anchorTimestamp: start + 360_000 },
};

test('@browser Scene v2 keeps one and consecutive Gap slots without fake bars', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (value) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const adapter = await KLineChartsSceneAdapter.create(container, value);
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		const snapshot = adapter.inspect();
		const exported = adapter.exportScene();
		adapter.dispose();
		return {
			snapshot,
			version: exported.version,
			gapKinds: exported.gaps?.map((item) => item.classification),
			gapHasOpen: exported.gaps?.some((item) => 'open' in item),
		};
	}, scene);

	expect(result.snapshot.dataCount).toBe(4);
	expect(result.snapshot.timelineSlotCount).toBe(7);
	expect(result.snapshot.gapCount).toBe(3);
	expect(result.snapshot.indicators).toEqual([]);
	expect(result.version).toBe(2);
	expect(result.gapKinds).toEqual([
		'SOURCE_ERROR',
		'UNKNOWN_MISSING',
		'UNKNOWN_MISSING',
	]);
	expect(result.gapHasOpen).toBe(false);
	expect(pageErrors).toEqual([]);
});
