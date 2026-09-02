import { describe, expect, it } from 'vitest';

import invalidDuplicateId from '../../../tests/fixtures/scenes/invalid-duplicate-id.json';
import invalidOhlc from '../../../tests/fixtures/scenes/invalid-ohlc.json';
import m1CandleHorizontalLine from '../../../tests/fixtures/scenes/m1-candle-horizontal-line.json';
import type { ChartScene, SceneOverlay } from '../src/index.js';
import { parseChartScene, SceneError } from '../src/index.js';
import {
	addIndicatorPane,
	makeIndicator,
	makeOverlay,
	makeScene,
} from './helpers/scene.js';

function promoteToM2(scene: ChartScene, scale: 'linear' | 'logarithmic' = 'linear'): void {
	(scene.runtime as { runtimeVersion: string }).runtimeVersion = '0.2.0';
	for (const pane of scene.panes) {
		for (const axis of pane.yAxes) {
			(axis as typeof axis & { scale: string }).scale =
				pane.kind === 'candle' && axis.role === 'primary' ? scale : 'linear';
		}
	}
}

function addMeasurement(scene: ChartScene, startValue = 12.4, endValue = 12.9): void {
	const base = makeOverlay('segment') as unknown as Record<string, unknown>;
	const measurement = {
		...base,
		id: 'm2-measurement',
		type: 'priceMeasurement',
		start: { timestamp: scene.data[0]!.timestamp, value: startValue },
		end: { timestamp: scene.data[2]!.timestamp, value: endValue },
	};
	delete measurement.points;
	(scene.overlays as unknown[]).push(measurement);
}

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

	it('accepts an open below the reported low', () => {
		const scene = makeScene();
		scene.data[0]!.open = scene.data[0]!.low - 1;

		expect(parseChartScene(scene).data[0]!.open).toBe(scene.data[0]!.open);
	});

	it('accepts an open above the reported high', () => {
		const scene = makeScene();
		scene.data[0]!.open = scene.data[0]!.high + 1;

		expect(parseChartScene(scene).data[0]!.open).toBe(scene.data[0]!.open);
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
		const scene = structuredClone(m1CandleHorizontalLine);
		scene.overlays[0]!.paneId = 'pane-missing';

		expect(captureSceneError(scene)).toMatchObject({
			code: 'INVALID_REFERENCE',
			path: '/overlays/0/paneId',
		});
	});

	it('rejects timestamp from a horizontalStraightLine value anchor', () => {
		const scene = structuredClone(m1CandleHorizontalLine);
		const anchor = scene.overlays[0]!.anchor as { timestamp?: number; value: number };
		anchor.timestamp = scene.data[0]!.timestamp;

		expect(captureSceneError(scene)).toMatchObject({
			code: 'SCENE_SCHEMA_INVALID',
			path: '/overlays/0/anchor',
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

	it('keeps the canonical M1 scene byte-for-byte free of scale', () => {
		const parsed = parseChartScene(m1CandleHorizontalLine);
		expect(JSON.stringify(parsed)).not.toContain('"scale"');
		expect(parsed.runtime.runtimeVersion).toBe('0.1.0');
	});

	it('accepts Runtime 0.2.0 only when every Y-axis has an explicit valid scale', () => {
		const scene = makeScene();
		promoteToM2(scene, 'logarithmic');

		const parsed = parseChartScene(scene);
		expect((parsed.panes[0]!.yAxes[0] as { scale?: string }).scale).toBe('logarithmic');
		expect(parsed.runtime.runtimeVersion).toBe('0.2.0');
	});

	it('rejects scale in Runtime 0.1.0 and missing scale in Runtime 0.2.0', () => {
		const oldScene = makeScene();
		(oldScene.panes[0]!.yAxes[0] as typeof oldScene.panes[0]['yAxes'][0] & { scale: string })
			.scale = 'linear';
		expect(captureSceneError(oldScene).code).toBe('SCENE_SCHEMA_INVALID');

		const newScene = makeScene();
		(newScene.runtime as { runtimeVersion: string }).runtimeVersion = '0.2.0';
		expect(captureSceneError(newScene).code).toBe('SCENE_SCHEMA_INVALID');
	});

	it('requires every non-candle-primary Runtime 0.2.0 Y-axis to remain linear', () => {
		const scene = makeScene();
		promoteToM2(scene);
		addIndicatorPane(scene, makeIndicator('MACD', 0));
		(scene.panes[1]!.yAxes[0] as typeof scene.panes[1]['yAxes'][0] & { scale: string })
			.scale = 'logarithmic';

		expect(captureSceneError(scene)).toMatchObject({
			code: 'SCENE_SCHEMA_INVALID',
			path: '/panes/1/yAxes/0/scale',
		});
	});

	it.each([
		['open', 0],
		['high', -1],
		['low', 0],
		['close', -0.01],
	] as const)('rejects non-positive logarithmic candle %s=%s', (field, value) => {
		const scene = makeScene();
		promoteToM2(scene, 'logarithmic');
		scene.data[0]![field] = value;
		if (field === 'high') {
			scene.data[0]!.open = value;
			scene.data[0]!.low = value;
			scene.data[0]!.close = value;
		}

		expect(captureSceneError(scene).code).toBe('INVALID_MARKET_DATA');
	});

	it.each([0, -1])('rejects priceMeasurement start value %s in both axis modes', (value) => {
		const scene = makeScene();
		promoteToM2(scene);
		addMeasurement(scene, value, 12.9);

		expect(captureSceneError(scene)).toMatchObject({
			code: 'SCENE_SCHEMA_INVALID',
			path: '/overlays/0/start/value',
		});
	});

	it('requires priceMeasurement timestamps to reference embedded bars', () => {
		const scene = makeScene();
		promoteToM2(scene);
		addMeasurement(scene);
		(scene.overlays[0] as unknown as { start: { timestamp: number } }).start.timestamp += 1;

		expect(captureSceneError(scene)).toMatchObject({
			code: 'INVALID_REFERENCE',
			path: '/overlays/0/start/timestamp',
		});
	});

	it('rejects priceMeasurement in Runtime 0.1.0', () => {
		const scene = makeScene();
		addMeasurement(scene);

		expect(captureSceneError(scene)).toMatchObject({
			code: 'SCENE_SCHEMA_INVALID',
			path: '/overlays/0/type',
		});
	});
});
