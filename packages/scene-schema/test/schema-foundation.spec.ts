import { describe, expect, it } from 'vitest';

import duplicateTime from '../../../tests/fixtures/scenes/invalid-duplicate-time.json';
import minimalScene from '../../../tests/fixtures/scenes/minimal-valid.json';
import { parseChartScene } from '../src/index.js';

describe('ChartScene foundation', () => {
	it('accepts a complete minimal scene', () => {
		expect(parseChartScene(minimalScene).schema).toBe('@baron1996/kline-scene');
	});

	it('rejects duplicate timestamps', () => {
		expect(() => parseChartScene(duplicateTime)).toThrowError(
			expect.objectContaining({ code: 'INVALID_MARKET_DATA' }),
		);
	});

	it('preserves independently missing volume and turnover', () => {
		const scene = structuredClone(minimalScene);
		delete scene.data[0].volume;
		delete scene.data[1].turnover;

		const parsed = parseChartScene(scene);
		expect(parsed.data[0]).not.toHaveProperty('volume');
		expect(parsed.data[1]).not.toHaveProperty('turnover');
	});
});
