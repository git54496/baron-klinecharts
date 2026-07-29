import { describe, expect, it } from 'vitest';

import m1CandleHorizontalLine from '../../../tests/fixtures/scenes/m1-candle-horizontal-line.json';
import { hashCanonicalScene, serializeCanonicalScene } from '../src/index.js';
import { makeScene } from './helpers/scene.js';

describe('RFC 8785 canonical Scene JSON', () => {
	it('produces stable canonical bytes and SHA-256 for the M1 fixture', async () => {
		const firstBytes = serializeCanonicalScene(m1CandleHorizontalLine);
		const reparsed = JSON.parse(new TextDecoder().decode(firstBytes));
		const secondBytes = serializeCanonicalScene(reparsed);

		expect(firstBytes).toEqual(secondBytes);
		expect(await hashCanonicalScene(m1CandleHorizontalLine)).toBe(
			await hashCanonicalScene(reparsed),
		);
	});

	it('produces identical UTF-8 bytes for different input key orders', () => {
		const first = makeScene();
		first.metadata = { z: 1, a: '中文', nested: { y: true, x: null } };
		const second = makeScene();
		second.metadata = { nested: { x: null, y: true }, a: '中文', z: 1 };

		expect(serializeCanonicalScene(first)).toEqual(serializeCanonicalScene(second));
	});

	it('uses RFC 8785 object-key ordering and number serialization', () => {
		const scene = makeScene();
		scene.metadata = { exponent: 1e30, negativeZero: -0, beta: 2, alpha: 1 };
		const json = new TextDecoder().decode(serializeCanonicalScene(scene));

		expect(json).toContain(
			'"metadata":{"alpha":1,"beta":2,"exponent":1e+30,"negativeZero":0}',
		);
	});

	it('produces a stable lowercase SHA-256 digest', async () => {
		const scene = makeScene();
		const first = await hashCanonicalScene(scene);
		const second = await hashCanonicalScene(structuredClone(scene));

		expect(first).toBe(second);
		expect(first).toBe('b8a7b7f1dcfea25cc599a5c6603cd7e6101530ba5af567cabc7f1ed72cbe577d');
	});

	it('validates before serialization', () => {
		const scene = makeScene();
		scene.data[0]!.timestamp = Number.MAX_SAFE_INTEGER + 1;

		expect(() => serializeCanonicalScene(scene)).toThrowError(
			expect.objectContaining({ code: 'INVALID_MARKET_DATA' }),
		);
	});
});
