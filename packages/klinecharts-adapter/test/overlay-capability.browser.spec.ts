import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allOverlays = loadScene('all-overlays.json');

test('@browser aligns overlay registry with engine supported overlays', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			SUPPORTED_OVERLAYS,
			PROJECT_OVERLAYS,
			KLineChartsSceneAdapter,
		} = await import('/src/index.ts');
		const allSupported = [...SUPPORTED_OVERLAYS].sort();
		const project = [...PROJECT_OVERLAYS].sort();
		const allProjectKnown = project.every((overlayType) => allSupported.includes(overlayType));

		const sceneForM2 = structuredClone(scene);
		sceneForM2.runtime.runtimeVersion = '0.2.0';
		for (const pane of sceneForM2.panes) {
			pane.yAxes = pane.yAxes.map((axis) => ({
				...axis,
				scale: 'linear',
			}));
		}

		const sceneForRoundtrip = {
			...sceneForM2,
			overlays: [
				...sceneForM2.overlays,
				{
					type: 'priceMeasurement',
					id: 'overlay-priceMeasurement-22',
					paneId: 'pane-candle',
					visible: true,
					locked: false,
					zLevel: 99,
					mode: 'normal',
					start: {
						timestamp: 1_784_736_000_000,
						value: 12.5,
					},
					end: {
						timestamp: 1_784_822_400_000,
						value: 12.9,
					},
					styles: {
						line: {
							color: 'rgba(41, 98, 255, 1)',
							size: 1,
							style: 'solid',
						},
						fill: {
							color: 'rgba(41, 98, 255, 0.15)',
						},
						text: {
							color: 'rgba(255, 255, 255, 1)',
							size: 12,
							family: 'Baron Sans',
							weight: 'normal',
							backgroundColor: 'rgba(41, 98, 255, 1)',
							borderColor: 'rgba(41, 98, 255, 1)',
						},
					},
					metadata: {
						source: 'browser-overlays-capability',
					},
				},
			],
		};

		const adapter = await KLineChartsSceneAdapter.create(
			document.querySelector<HTMLElement>('#chart')!,
			sceneForRoundtrip,
		);
		const exported = adapter.exportScene();
		const exportedTypes = exported.overlays.map((overlay) => overlay.type).sort();
		adapter.dispose();

		return {
			allProjectKnown,
			exportedOverlayCount: exported.overlays.length,
			allSupportedCount: allSupported.length,
			exportedTypes,
		};
	}, allOverlays);

	expect(result.allProjectKnown).toBe(true);
	expect(result.allSupportedCount).toBeGreaterThanOrEqual(22);
	expect(result.exportedOverlayCount).toBe(22);
	expect(result.exportedTypes.includes('priceMeasurement')).toBe(true);
});
