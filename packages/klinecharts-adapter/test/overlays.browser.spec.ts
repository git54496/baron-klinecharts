import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allOverlays = loadScene('all-overlays.json');
const m1Scene = loadScene('m1-candle-horizontal-line.json');

test('@browser round-trips all 21 registered Overlay types', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const exported = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const adapter = await KLineChartsSceneAdapter.create(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const value = adapter.exportScene();
		adapter.dispose();
		return value;
	}, allOverlays);

	expect(exported.overlays).toEqual(allOverlays.overlays);
	expect(JSON.stringify(exported)).not.toContain('candle_pane');
});

test('@browser adds the M1 horizontal line with its stable Scene ID and data anchor', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const expectedOverlay = structuredClone(scene.overlays[0]!);
		const emptyScene = structuredClone(scene);
		emptyScene.overlays = [];
		const adapter = await KLineChartsSceneAdapter.create(container, emptyScene);
		const created = adapter.addOverlay(expectedOverlay);
		const exportedScene = adapter.exportScene();
		const snapshot = adapter.inspect();
		const exportedOverlay = exportedScene.overlays[0]!;
		const forbiddenFieldPaths: string[] = [];
		const visit = (value: unknown, path: string): void => {
			if (value === null || typeof value !== 'object') {
				return;
			}
			for (const [key, child] of Object.entries(value)) {
				const childPath = `${path}/${key}`;
				if (/pixel|screen|coordinate|index/i.test(key)) {
					forbiddenFieldPaths.push(childPath);
				}
				visit(child, childPath);
			}
		};
		visit(exportedOverlay, '/overlays/0');
		adapter.dispose();
		return {
			createdId: created.id,
			exportedOverlay,
			forbiddenFieldPaths,
			overlayCount: exportedScene.overlays.length,
			snapshotIds: snapshot.overlays.map((overlay) => overlay.id),
		};
	}, m1Scene);

	const expectedOverlay = m1Scene.overlays[0]!;
	expect(result.createdId).toBe(expectedOverlay.id);
	expect(result.snapshotIds).toEqual([expectedOverlay.id]);
	expect(result.overlayCount).toBe(1);
	expect(result.exportedOverlay).toEqual(expectedOverlay);
	expect(Object.keys(result.exportedOverlay.anchor!)).toEqual(['value']);
	expect(result.forbiddenFieldPaths).toEqual([]);
});
