import { describe, expect, it } from 'vitest';

import invalidDuplicateId from '../../../tests/fixtures/scenes/invalid-duplicate-id.json';
import invalidOhlc from '../../../tests/fixtures/scenes/invalid-ohlc.json';
import type { ChartScene, SceneOverlay } from '../src/index.js';
import { parseChartScene, SceneError } from '../src/index.js';
import {
	addIndicatorPane,
	makeIndicator,
	makeOverlay,
	makeScene,
} from './helpers/scene.js';

function captureSceneError(scene: unknown): SceneError {
	try {
		parseChartScene(scene);
	} catch (error) {
		expect(error).toBeInstanceOf(SceneError);
		return error as SceneError;
	}
	throw new Error('Expected parseChartScene to throw.');
}

describe('ChartScene semantic validation', () => {
	it.each([
		['invalid OHLC', invalidOhlc, 'INVALID_MARKET_DATA'],
		['duplicate ID', invalidDuplicateId, 'DUPLICATE_ID'],
	] as const)('rejects the %s fixture', (_label, scene, code) => {
		expect(captureSceneError(scene).code).toBe(code);
	});

	it('rejects timestamps that are not strictly increasing', () => {
		const scene = makeScene();
		scene.data[1]!.timestamp = scene.data[0]!.timestamp - 1;

		expect(captureSceneError(scene).code).toBe('INVALID_MARKET_DATA');
	});

	it('rejects duplicate timestamps', () => {
		const scene = makeScene();
		scene.data[1]!.timestamp = scene.data[0]!.timestamp;

		expect(captureSceneError(scene)).toMatchObject({
			code: 'INVALID_MARKET_DATA',
			path: '/data/1/timestamp',
		});
	});

	it('rejects invalid OHLC relationships', () => {
		const scene = makeScene();
		scene.data[0]!.low = scene.data[0]!.high + 1;

		expect(captureSceneError(scene)).toMatchObject({
			code: 'INVALID_MARKET_DATA',
			path: '/data/0',
		});
	});

	it('rejects duplicate Pane IDs', () => {
		const scene = makeScene();
		const duplicate = structuredClone(scene.panes[0]!);
		duplicate.kind = 'indicator';
		duplicate.order = 1;
		duplicate.indicators = [makeIndicator('MACD', 1)];
		duplicate.indicators[0]!.paneId = duplicate.id;
		duplicate.indicators[0]!.yAxisId = duplicate.yAxes[0]!.id;
		scene.panes.push(duplicate);

		expect(captureSceneError(scene).code).toBe('DUPLICATE_ID');
	});

	it('rejects duplicate Y-axis IDs', () => {
		const scene = makeScene();
		scene.panes[0]!.yAxes.push({
			...structuredClone(scene.panes[0]!.yAxes[0]!),
			role: 'additional',
		});

		expect(captureSceneError(scene).code).toBe('DUPLICATE_ID');
	});

	it('rejects duplicate Indicator IDs', () => {
		const scene = makeScene();
		addIndicatorPane(scene, makeIndicator('MACD', 0));
		const duplicate = makeIndicator('RSI', 1);
		duplicate.id = scene.panes[1]!.indicators[0]!.id;
		addIndicatorPane(scene, duplicate);

		expect(captureSceneError(scene).code).toBe('DUPLICATE_ID');
	});

	it('rejects duplicate Overlay IDs', () => {
		const scene = makeScene();
		const first = makeOverlay('segment', 0);
		const second = makeOverlay('rectangle', 1);
		second.id = first.id;
		scene.overlays.push(first, second);

		expect(captureSceneError(scene).code).toBe('DUPLICATE_ID');
	});

	it('rejects a missing Overlay Pane reference', () => {
		const scene = makeScene();
		const overlay = makeOverlay('text');
		overlay.paneId = 'pane-missing';
		scene.overlays.push(overlay);

		expect(captureSceneError(scene)).toMatchObject({
			code: 'INVALID_REFERENCE',
			path: '/overlays/0/paneId',
		});
	});

	it('rejects a tool-specific point count', () => {
		const scene = makeScene();
		const overlay = makeOverlay('segment') as Extract<SceneOverlay, { points?: unknown }>;
		overlay.points = [
			{ timestamp: scene.data[0]!.timestamp, value: 12.3 },
			{ timestamp: scene.data[1]!.timestamp, value: 12.5 },
			{ timestamp: scene.data[2]!.timestamp, value: 12.6 },
		];
		scene.overlays.push(overlay as SceneOverlay);

		expect(captureSceneError(scene)).toMatchObject({
			code: 'SCENE_SCHEMA_INVALID',
			path: '/overlays/0/points',
		});
	});

	it('rejects unsafe timestamps before semantic validation', () => {
		const scene = makeScene();
		scene.data[0]!.timestamp = Number.MAX_SAFE_INTEGER + 1;

		expect(captureSceneError(scene).code).toBe('INVALID_MARKET_DATA');
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		'rejects a non-finite market-data value: %s',
		(value) => {
			const scene = makeScene();
			scene.data[0]!.close = value;

			expect(captureSceneError(scene).code).toBe('INVALID_MARKET_DATA');
		},
	);

	it.each([
		['engine', 'other-engine'],
		['engineVersion', '9.9.9'],
		['runtimeVersion', '2.0.0'],
	] as const)('rejects a mismatched RuntimeIdentity %s', (field, value) => {
		const scene = makeScene();
		(scene.runtime as Record<string, string>)[field] = value;

		expect(captureSceneError(scene).code).toBe('ENGINE_VERSION_MISMATCH');
	});

	it('retains all ordered issues while exposing the first stable error', () => {
		const scene = makeScene();
		scene.data[1]!.timestamp = scene.data[0]!.timestamp;
		scene.data[1]!.low = scene.data[1]!.high + 1;

		const error = captureSceneError(scene);
		expect(error.code).toBe('INVALID_MARKET_DATA');
		expect(error.issues.map((item) => item.path)).toEqual([
			'/data/1/timestamp',
			'/data/1',
		]);
	});

	it('does not mutate the input while validating it', () => {
		const scene = makeScene();
		const before = structuredClone(scene);

		parseChartScene(scene);
		expect(scene).toEqual(before);
	});
});
