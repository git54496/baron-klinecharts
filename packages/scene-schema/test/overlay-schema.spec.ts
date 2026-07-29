import { describe, expect, it } from 'vitest';

import allOverlays from '../../../tests/fixtures/scenes/all-overlays.json';
import invalidOverlayAnchor from '../../../tests/fixtures/scenes/invalid-overlay-anchor.json';
import invalidOverlayCode from '../../../tests/fixtures/scenes/invalid-overlay-code.json';
import m1CandleHorizontalLine from '../../../tests/fixtures/scenes/m1-candle-horizontal-line.json';
import type { SceneOverlay } from '../src/generated/chart-scene.js';
import { parseChartScene, SceneError } from '../src/index.js';
import { makeOverlay, makeScene } from './helpers/scene.js';

type MutableM1Overlay = Record<string, unknown> & {
	anchor: Record<string, unknown>;
};

function makeM1Fixture(): {
	overlays: MutableM1Overlay[];
} {
	return structuredClone(m1CandleHorizontalLine) as unknown as {
		overlays: MutableM1Overlay[];
	};
}

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
	it('accepts the M1 candle and horizontal-line fixture', () => {
		const scene = parseChartScene(m1CandleHorizontalLine);
		expect(scene.period).toEqual({ span: 1, type: 'day' });
		expect(scene.panes).toHaveLength(1);
		expect(scene.overlays).toHaveLength(1);
		expect(scene.overlays[0]).toMatchObject({
			id: 'overlay-m1-horizontal-reference',
			type: 'horizontalStraightLine',
			paneId: 'pane-candle',
			anchor: { value: 101.25 },
			styles: {
				line: {
					color: 'rgba(41, 98, 255, 1)',
					size: 1,
					style: 'solid',
				},
			},
		});
		expect(Object.keys(scene.overlays[0]?.anchor ?? {})).toEqual(['value']);
	});

	it.each([
		['id', (overlay: MutableM1Overlay) => delete overlay.id],
		['paneId', (overlay: MutableM1Overlay) => delete overlay.paneId],
		['value', (overlay: MutableM1Overlay) => delete overlay.anchor.value],
		['styles', (overlay: MutableM1Overlay) => delete overlay.styles],
	])('rejects the M1 horizontal line without %s', (_field, removeField) => {
		const scene = makeM1Fixture();
		removeField(scene.overlays[0]!);

		expect(() => parseChartScene(scene)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'SCENE_SCHEMA_INVALID' }),
		);
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		'rejects a non-finite M1 horizontal-line value: %s',
		(value) => {
			const scene = makeM1Fixture();
			scene.overlays[0]!.anchor.value = value;

			expect(() => parseChartScene(scene)).toThrowError(
				expect.objectContaining<Partial<SceneError>>({ code: 'SCENE_SCHEMA_INVALID' }),
			);
		},
	);

	it('round-trips opaque M1 horizontal-line metadata unchanged', () => {
		const scene = parseChartScene(m1CandleHorizontalLine);
		expect(scene.overlays[0]?.metadata).toEqual({
			labels: ['m1', 'reference-line'],
			opaque: {
				owner: 'fixture-consumer',
				revision: 1,
			},
		});
	});

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
