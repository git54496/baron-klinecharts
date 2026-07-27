import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
	generateMockScene,
	serializeMockScene,
} from '../../tools/generate-mock-scene.mjs';

const committedScenePath = resolve('examples', 'vanilla', 'mock-year.scene.json');

test('fixed inputs generate byte-identical mock scenes', () => {
	assert.equal(serializeMockScene(), serializeMockScene());
});

test('mock scene has the declared identity and 250 valid weekday bars', () => {
	const scene = generateMockScene();

	assert.deepEqual(scene.symbol, {
		ticker: 'MOCK.CN',
		name: '确定性模拟行情',
		pricePrecision: 2,
		volumePrecision: 0,
	});
	assert.equal(scene.data.length, 250);
	assert.equal(scene.viewport.anchorTimestamp, scene.data.at(-1)?.timestamp);
	assert.equal(scene.metadata.source, 'deterministic-mock');

	for (const [index, bar] of scene.data.entries()) {
		const day = new Date(bar.timestamp).getUTCDay();
		assert.notEqual(day, 0, `bar ${index} must not be Sunday`);
		assert.notEqual(day, 6, `bar ${index} must not be Saturday`);
		assert.ok(Number.isFinite(bar.open), `bar ${index} open must be finite`);
		assert.ok(Number.isFinite(bar.high), `bar ${index} high must be finite`);
		assert.ok(Number.isFinite(bar.low), `bar ${index} low must be finite`);
		assert.ok(Number.isFinite(bar.close), `bar ${index} close must be finite`);
		assert.ok(Number.isInteger(bar.volume), `bar ${index} volume must be an integer`);
		assert.ok(Number.isInteger(bar.turnover), `bar ${index} turnover must be an integer`);
		assert.ok(bar.low <= bar.open, `bar ${index} low must not exceed open`);
		assert.ok(bar.low <= bar.close, `bar ${index} low must not exceed close`);
		assert.ok(bar.high >= bar.open, `bar ${index} high must not be below open`);
		assert.ok(bar.high >= bar.close, `bar ${index} high must not be below close`);

		if (index > 0) {
			assert.ok(
				bar.timestamp > scene.data[index - 1].timestamp,
				`bar ${index} timestamp must increase`,
			);
		}
	}
});

test('committed mock scene exactly matches the generator output', async () => {
	assert.equal(await readFile(committedScenePath, 'utf8'), serializeMockScene());
});
