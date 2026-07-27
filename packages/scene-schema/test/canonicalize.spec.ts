import { describe, expect, it } from 'vitest';

import { canonicalizeScene, parseChartScene } from '../src/index.js';
import { makeScene } from './helpers/scene.js';

describe('ChartScene canonicalization', () => {
	it('deep-clones the Scene and sorts object keys without reordering arrays', () => {
		const scene = makeScene();
		scene.metadata = {
			zeta: 1,
			nested: { z: true, a: false },
			alpha: 2,
		};
		const canonical = canonicalizeScene(scene);

		expect(canonical).not.toBe(scene);
		expect(canonical.data).not.toBe(scene.data);
		expect(Object.keys(canonical)).toEqual([...Object.keys(canonical)].sort());
		expect(Object.keys(canonical.metadata)).toEqual(['alpha', 'nested', 'zeta']);
		expect(Object.keys(canonical.metadata.nested as object)).toEqual(['a', 'z']);
		expect(canonical.data.map((bar) => bar.timestamp)).toEqual(
			scene.data.map((bar) => bar.timestamp),
		);
	});

	it('preserves independently optional volume and turnover fields', () => {
		const scene = makeScene();
		delete scene.data[0]!.volume;
		delete scene.data[1]!.turnover;

		const canonical = parseChartScene(scene);
		expect('volume' in canonical.data[0]!).toBe(false);
		expect(canonical.data[0]!.turnover).toBe(1285120);
		expect('turnover' in canonical.data[1]!).toBe(false);
		expect(canonical.data[1]!.volume).toBe(119800);
	});

	it('never mutates the input while sorting nested metadata', () => {
		const scene = makeScene();
		scene.metadata = { second: 2, first: 1 };
		const originalKeys = Object.keys(scene.metadata);

		canonicalizeScene(scene);
		expect(Object.keys(scene.metadata)).toEqual(originalKeys);
	});
});
