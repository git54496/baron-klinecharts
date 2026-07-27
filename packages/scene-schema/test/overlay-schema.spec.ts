import { describe, expect, it } from 'vitest';

import allOverlays from '../../../tests/fixtures/scenes/all-overlays.json';
import invalidOverlayAnchor from '../../../tests/fixtures/scenes/invalid-overlay-anchor.json';
import invalidOverlayCode from '../../../tests/fixtures/scenes/invalid-overlay-code.json';
import type { SceneOverlay } from '../src/generated/chart-scene.js';
import { parseChartScene, SceneError } from '../src/index.js';
import { makeOverlay, makeScene } from './helpers/scene.js';

const overlayTypes: SceneOverlay['type'][] = [
	'horizontalRayLine',
	'horizontalSegment',
	'horizontalStraightLine',
	'verticalRayLine',
	'verticalSegment',
	'verticalStraightLine',
	'rayLine',
	'segment',
	'straightLine',
	'priceLine',
	'priceChannelLine',
	'parallelStraightLine',
	'fibonacciLine',
	'brush',
	'simpleAnnotation',
	'simpleTag',
	'rectangle',
	'arrow',
	'crossLine',
	'callout',
	'text',
];

describe('supported Overlay schema', () => {
	it('accepts the complete static Overlay fixture', () => {
		expect(parseChartScene(allOverlays).overlays).toHaveLength(21);
	});

	it.each([
		['invalid anchor', invalidOverlayAnchor],
		['executable field', invalidOverlayCode],
	])('rejects the %s fixture', (_label, scene) => {
		expect(() => parseChartScene(scene)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'SCENE_SCHEMA_INVALID' }),
		);
	});

	it.each(overlayTypes)('accepts %s', (type) => {
		const scene = makeScene();
		scene.overlays.push(makeOverlay(type));
		expect(parseChartScene(scene).overlays[0]?.type).toBe(type);
	});

	it('rejects an unknown Overlay type', () => {
		const scene = makeScene();
		const overlay = makeOverlay('segment');
		(overlay as { type: string }).type = 'customOverlay';
		scene.overlays.push(overlay);
		expect(() => parseChartScene(scene)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'UNKNOWN_OVERLAY' }),
		);
	});

	it('rejects callback-shaped fields', () => {
		const scene = makeScene();
		const overlay = makeOverlay('segment') as SceneOverlay & { onClick: string };
		overlay.onClick = '() => alert(1)';
		scene.overlays.push(overlay);
		expect(() => parseChartScene(scene)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'SCENE_SCHEMA_INVALID' }),
		);
	});

	it('rejects a value anchor for a vertical straight line', () => {
		const scene = makeScene();
		const overlay = makeOverlay('verticalStraightLine');
		overlay.anchor = { value: 12.5 };
		scene.overlays.push(overlay);
		expect(() => parseChartScene(scene)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'SCENE_SCHEMA_INVALID' }),
		);
	});
});
