import { describe, expect, it } from 'vitest';

import { parseChartScene, SceneError } from '../src/index.js';
import { makeScene } from './helpers/scene.js';

function gap(timestamp: number) {
	return {
		timestamp,
		barEnd: timestamp + 60_000,
		classification: 'SOURCE_ERROR',
		reasonCode: 'UPSTREAM_TIMEOUT',
		retryable: true,
	} as const;
}

describe('ChartScene v2 market-data gaps', () => {
	it('keeps v1 strict and requires gaps for v2', () => {
		const v1 = makeScene();
		expect(parseChartScene(v1).version).toBe(1);
		expect(() => parseChartScene({ ...v1, gaps: [] })).toThrowError(SceneError);
		expect(() => parseChartScene({ ...v1, version: 2 })).toThrowError(SceneError);
		expect(parseChartScene({ ...v1, version: 2, gaps: [] }).gaps).toEqual([]);
	});

	it('keeps real bars strict and accepts one or consecutive gaps', () => {
		const scene = makeScene();
		const first = scene.data[0]!.timestamp + 60_000;
		const parsed = parseChartScene({
			...scene,
			version: 2,
			gaps: [gap(first), gap(first + 60_000), gap(first + 120_000)],
		});
		expect(parsed.data).toEqual(scene.data);
		expect(parsed.gaps).toHaveLength(3);
		expect(parsed.gaps?.every((item) => !('open' in item))).toBe(true);
	});

	it('rejects Bar/Gap timestamp conflicts and unsorted gaps', () => {
		const scene = makeScene();
		const conflict = scene.data[0]!.timestamp;
		expect(() => parseChartScene({
			...scene,
			version: 2,
			gaps: [gap(conflict)],
		})).toThrowError(/both a real Bar and a Gap/);
		expect(() => parseChartScene({
			...scene,
			version: 2,
			gaps: [gap(conflict + 120_000), gap(conflict + 60_000)],
		})).toThrowError(/strictly increasing/);
	});

	it('rejects fake prices and NO_SESSION gaps structurally', () => {
		const scene = makeScene();
		const timestamp = scene.data[0]!.timestamp + 60_000;
		expect(() => parseChartScene({
			...scene,
			version: 2,
			gaps: [{ ...gap(timestamp), open: 0 }],
		})).toThrowError(SceneError);
		expect(() => parseChartScene({
			...scene,
			version: 2,
			gaps: [{ ...gap(timestamp), classification: 'NO_SESSION' }],
		})).toThrowError(SceneError);
	});
});
