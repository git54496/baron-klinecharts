import { describe, expect, it } from 'vitest';

import {
	parseTimeSeriesScene,
	serializeCanonicalTimeSeriesScene,
	TimeSeriesSceneError,
} from '../src/index.js';
import { makeTimeSeriesScene } from './helpers/time-series-scene.js';

function expectIssue(
	value: unknown,
	code: string,
	path: string,
): void {
	try {
		parseTimeSeriesScene(value);
		expect.fail('Expected TimeSeriesScene validation to fail.');
	} catch (error) {
		expect(error).toBeInstanceOf(TimeSeriesSceneError);
		const sceneError = error as TimeSeriesSceneError;
		expect(sceneError.code).toBe(code);
		expect(sceneError.path).toBe(path);
	}
}

describe('TimeSeriesScene schema', () => {
	it('accepts and clones the minimal valid scene', () => {
		const scene = makeTimeSeriesScene();
		const parsed = parseTimeSeriesScene(scene);
		expect(parsed).toEqual(scene);
		expect(parsed).not.toBe(scene);
	});

	it('rejects unknown top-level fields', () => {
		const scene = { ...makeTimeSeriesScene(), fallback: true };
		expectIssue(scene, 'TIME_SERIES_SCENE_SCHEMA_INVALID', '/fallback');
	});

	it('maps unsupported versions and engines to dedicated errors', () => {
		const version = makeTimeSeriesScene();
		version.version = 2;
		expectIssue(
			version,
			'TIME_SERIES_SCENE_VERSION_UNSUPPORTED',
			'/version',
		);

		const engine = makeTimeSeriesScene();
		(engine.runtime as Record<string, unknown>).engineVersion = '11.0.0';
		expectIssue(
			engine,
			'TIME_SERIES_ENGINE_VERSION_MISMATCH',
			'/runtime/engineVersion',
		);
	});

	it('rejects duplicate series ids and inconsistent units', () => {
		const duplicate = makeTimeSeriesScene();
		const first = (duplicate.series as Record<string, unknown>[])[0];
		duplicate.series = [first, { ...first }];
		(duplicate.data as Record<string, unknown>[])[0].values = {
			'series-a': 12.34,
		};
		expectIssue(duplicate, 'TIME_SERIES_SCENE_SCHEMA_INVALID', '/series/1/id');

		const unit = makeTimeSeriesScene();
		const base = (unit.series as Record<string, unknown>[])[0];
		unit.series = [
			base,
			{ ...base, id: 'series-b', unit: 'other' },
		];
		(unit.data as Record<string, unknown>[])[0].values = {
			'series-a': 12.34,
			'series-b': 13,
		};
		expectIssue(unit, 'TIME_SERIES_SCENE_SCHEMA_INVALID', '/series/1/unit');
	});

	it('rejects invalid ordering and invalid value keys', () => {
		const ordering = makeTimeSeriesScene();
		const point = (ordering.data as Record<string, unknown>[])[0];
		ordering.data = [point, { ...point }];
		expectIssue(ordering, 'TIME_SERIES_SCENE_SCHEMA_INVALID', '/data/1/timestamp');

		const missing = makeTimeSeriesScene();
		const declared = (missing.series as Record<string, unknown>[])[0];
		missing.series = [declared, { ...declared, id: 'series-b' }];
		expectIssue(
			missing,
			'TIME_SERIES_SCENE_SCHEMA_INVALID',
			'/data/0/values/series-b',
		);

		const unknown = makeTimeSeriesScene();
		(unknown.data as Record<string, unknown>[])[0].values = {
			'series-a': 12.34,
			'series-b': null,
		};
		expectIssue(unknown, 'TIME_SERIES_SCENE_SCHEMA_INVALID', '/data/0/values/series-b');
	});

	it('rejects an anchor that is not a data timestamp', () => {
		const scene = makeTimeSeriesScene();
		(scene.viewport as Record<string, unknown>).anchorTimestamp = 1;
		expectIssue(scene, 'TIME_SERIES_SCENE_SCHEMA_INVALID', '/viewport/anchorTimestamp');
	});

	it('serializes deterministically without mutating the scene', () => {
		const scene = makeTimeSeriesScene();
		const before = structuredClone(scene);
		const first = serializeCanonicalTimeSeriesScene(scene);
		const second = serializeCanonicalTimeSeriesScene(scene);
		expect(first).toEqual(second);
		expect(scene).toEqual(before);
	});
});
