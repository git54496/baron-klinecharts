import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allIndicators = loadScene('all-indicators.json');

test('@browser creates all 27 allowlisted Indicators with Scene IDs', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const snapshot = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const adapter = await KLineChartsSceneAdapter.create(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const result = adapter.inspect();
		adapter.dispose();
		return result;
	}, allIndicators);

	const expected = allIndicators.panes[1]!.indicators.map(({ id, name, paneId, yAxisId }) => ({
		id,
		name,
		paneId,
		yAxisId,
	}));
	expect(snapshot.indicators).toEqual(expected);
	expect(JSON.stringify(snapshot)).not.toContain('baron_pane_');
	expect(JSON.stringify(snapshot)).not.toContain('baron_y_');
});
