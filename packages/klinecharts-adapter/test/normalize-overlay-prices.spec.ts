import type { SceneOverlay } from '@baron1996/kline-scene-schema';
import type { Overlay } from 'klinecharts';
import { describe, expect, it } from 'vitest';

import allOverlaysScene from '../../../tests/fixtures/scenes/all-overlays.json';
import m1Scene from '../../../tests/fixtures/scenes/m1-candle-horizontal-line.json';
import type { EngineIdMap } from '../src/conversion/id-map.js';
import {
	fromEngineOverlay,
	normalizeSceneOverlayPrices,
	toEngineOverlay,
} from '../src/conversion/overlays.js';

const idMap: EngineIdMap = {
	paneToEngine: new Map([['pane-candle', 'candle_pane']]),
	paneFromEngine: new Map([['candle_pane', 'pane-candle']]),
	yAxisToEngine: new Map(),
	yAxisFromEngine: new Map(),
};

function sourceOverlay(type: SceneOverlay['type']): SceneOverlay {
	const source = allOverlaysScene.overlays.find((overlay) => overlay.type === type);
	if (source === undefined) {
		throw new Error(`Missing fixture Overlay: ${type}`);
	}
	return structuredClone(source) as SceneOverlay;
}

describe('Scene Overlay price normalization before commit', () => {
	it('normalizes updateOverlay anchor.value exactly like the drawing commit path', () => {
		const source = structuredClone(m1Scene.overlays[0]) as SceneOverlay;
		const overlay = {
			...source,
			anchor: { value: 101.67084494773519 },
		};
		const normalized = normalizeSceneOverlayPrices(overlay, idMap, '/overlays/0', 2);

		expect(normalized.anchor).toEqual({ value: 101.67 });
		expect(normalized).toEqual({ ...source, anchor: { value: 101.67 } });
		// 提交给引擎的 overrideOverlay 参数（PUT 体）同样归一化。
		expect(toEngineOverlay(normalized, idMap, '/overlays/0').points)
			.toEqual([{ value: 101.67 }]);
	});

	it('produces the same result as the fromEngineOverlay drawing commit conversion', () => {
		const source = structuredClone(m1Scene.overlays[0]) as SceneOverlay;
		const overlay = {
			...source,
			anchor: { value: 101.67084494773519 },
		};
		const normalized = normalizeSceneOverlayPrices(overlay, idMap, '/overlays/0', 2);
		const expected = fromEngineOverlay(
			toEngineOverlay(overlay, idMap, '/overlays/0') as unknown as Overlay,
			overlay,
			idMap,
			'/overlays/0',
			2,
		);

		expect(normalized).toEqual(expected);
	});

	it('normalizes every price in multi-point overlays without changing timestamps', () => {
		const source = sourceOverlay('segment');
		const overlay = {
			...source,
			points: [
				{ timestamp: 1784736000000, value: 12.345 },
				{ timestamp: 1784822400000, value: -0.004 },
			],
		};
		const normalized = normalizeSceneOverlayPrices(overlay, idMap, '/overlays/0', 2);

		expect(normalized.points).toEqual([
			{ timestamp: 1784736000000, value: 12.35 },
			{ timestamp: 1784822400000, value: 0 },
		]);
		expect(Object.is(normalized.points?.[1]?.value, -0)).toBe(false);
		expect(toEngineOverlay(normalized, idMap, '/overlays/0').points).toEqual([
			{ timestamp: 1784736000000, value: 12.35 },
			{ timestamp: 1784822400000, value: 0 },
		]);
	});

	it('normalizes priceMeasurement endpoints without changing their timestamps', () => {
		const source = {
			...sourceOverlay('segment'),
			type: 'priceMeasurement',
			start: { timestamp: 1784736000000, value: 300.004 },
			end: { timestamp: 1784822400000, value: 330.006 },
		} as SceneOverlay;
		delete source.points;
		const normalized = normalizeSceneOverlayPrices(source, idMap, '/overlays/0', 2);

		expect(normalized.start).toEqual({ timestamp: 1784736000000, value: 300 });
		expect(normalized.end).toEqual({ timestamp: 1784822400000, value: 330.01 });
	});

	it('keeps time-only and non-price fields untouched', () => {
		const source = sourceOverlay('verticalStraightLine');
		const normalized = normalizeSceneOverlayPrices(source, idMap, '/overlays/0', 2);

		expect(normalized).toEqual(source);
		expect(normalized.anchor).toEqual(source.anchor);
		expect(normalized.styles).toEqual(source.styles);
		expect(normalized.metadata).toEqual(source.metadata);
	});
});
