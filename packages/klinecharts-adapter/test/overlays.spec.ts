import type { SceneOverlay } from '@baron1996/kline-scene-schema';
import type { Overlay } from 'klinecharts';
import { describe, expect, it } from 'vitest';

import allOverlaysScene from '../../../tests/fixtures/scenes/all-overlays.json';
import m1Scene from '../../../tests/fixtures/scenes/m1-candle-horizontal-line.json';
import type { EngineIdMap } from '../src/conversion/id-map.js';
import { fromEngineOverlay } from '../src/conversion/overlays.js';

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

function engineOverlay(
	source: SceneOverlay,
	points: Overlay['points'],
): Overlay {
	return {
		id: source.id,
		name: source.type,
		paneId: 'candle_pane',
		points,
	} as Overlay;
}

describe('engine Overlay to Scene conversion', () => {
	it('normalizes the production horizontal line value to symbol pricePrecision', () => {
		const source = structuredClone(m1Scene.overlays[0]) as SceneOverlay;
		const converted = fromEngineOverlay(
			engineOverlay(source, [{ value: 101.67084494773519 }]),
			source,
			idMap,
			'/overlays/0',
			2,
		);

		expect(converted.anchor).toEqual({ value: 101.67 });
	});

	it('normalizes every value in a representative multi-point Overlay without changing timestamps', () => {
		const source = sourceOverlay('segment');
		const points = [
			{ timestamp: 1784736000000, value: 12.345 },
			{ timestamp: 1784822400000, value: -0.004 },
		];
		const converted = fromEngineOverlay(
			engineOverlay(source, points),
			source,
			idMap,
			'/overlays/0',
			2,
		);

		expect(converted.points).toEqual([
			{ timestamp: 1784736000000, value: 12.35 },
			{ timestamp: 1784822400000, value: 0 },
		]);
		expect(Object.is(converted.points?.[1]?.value, -0)).toBe(false);
	});

	it('does not modify a time-only Overlay coordinate', () => {
		const source = sourceOverlay('verticalStraightLine');
		const converted = fromEngineOverlay(
			engineOverlay(source, [{ timestamp: 1784736000000 }]),
			source,
			idMap,
			'/overlays/0',
			2,
		);

		expect(converted.anchor).toEqual({ timestamp: 1784736000000 });
	});
});
