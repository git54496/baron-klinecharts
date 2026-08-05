import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const allOverlays = loadScene('all-overlays.json');
const m1Scene = loadScene('m1-candle-horizontal-line.json');

test('@browser round-trips all registered Overlay types', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const exported = await page.evaluate(async (scene) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const sceneForM2 = structuredClone(scene);
		sceneForM2.runtime.runtimeVersion = '0.2.0';
		for (const pane of sceneForM2.panes) {
			pane.yAxes = pane.yAxes.map((axis) => ({
				...axis,
				scale: 'linear',
			}));
		}
		const overlaySet = {
			...sceneForM2,
			overlays: [
				...sceneForM2.overlays,
				{
					id: 'overlay-priceMeasurement-21',
					type: 'priceMeasurement',
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
			overlaySet,
		);
		const value = adapter.exportScene();
		adapter.dispose();
		return value;
	}, allOverlays);

	expect(exported.overlays).toHaveLength(22);
	const exportedTypes = exported.overlays.map((overlay) => overlay.type).sort();
	expect(exportedTypes).toEqual([
		'arrow',
		'brush',
		'callout',
		'crossLine',
		'fibonacciLine',
		'horizontalRayLine',
		'horizontalSegment',
		'horizontalStraightLine',
		'parallelStraightLine',
		'priceChannelLine',
		'priceLine',
		'priceMeasurement',
		'rayLine',
		'rectangle',
		'segment',
		'simpleAnnotation',
		'simpleTag',
		'straightLine',
		'text',
		'verticalRayLine',
		'verticalSegment',
		'verticalStraightLine',
	]);
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
