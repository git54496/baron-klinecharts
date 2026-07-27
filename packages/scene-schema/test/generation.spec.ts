import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	ChartSceneSchema,
	parseChartScene,
} from '../src/index.js';
import { makeScene } from './helpers/scene.js';

const packageDirectory = process.cwd();
const generatedFiles = [
	'src/generated/chart-scene.ts',
	'src/generated/schemas.ts',
	'src/generated/validate-chart-scene.ts',
] as const;
const generatedFixtures = [
	'all-indicators.json',
	'all-overlays.json',
	'invalid-ohlc.json',
	'invalid-duplicate-id.json',
	'invalid-indicator-reference.json',
	'invalid-overlay-anchor.json',
	'invalid-overlay-code.json',
].map((name) => join(packageDirectory, '..', '..', 'tests', 'fixtures', 'scenes', name));

describe('schema code generation', () => {
	it('is deterministic and leaves current generated sources unchanged', async () => {
		const before = await Promise.all(
			[
				...generatedFiles.map((file) => join(packageDirectory, file)),
				...generatedFixtures,
			].map((file) => readFile(file, 'utf8')),
		);

		execFileSync(process.execPath, ['scripts/generate.mjs'], {
			cwd: packageDirectory,
			stdio: 'pipe',
		});
		execFileSync(process.execPath, ['scripts/generate-fixtures.mjs'], {
			cwd: packageDirectory,
			stdio: 'pipe',
		});

		const after = await Promise.all(
			[
				...generatedFiles.map((file) => join(packageDirectory, file)),
				...generatedFixtures,
			].map((file) => readFile(file, 'utf8')),
		);
		expect(after).toEqual(before);
	});

	it('embeds the exact top-level source schema', async () => {
		const source = JSON.parse(
			await readFile(join(packageDirectory, 'schema/chart-scene.schema.json'), 'utf8'),
		) as unknown;

		expect(ChartSceneSchema).toEqual(source);
	});

	it('generates a validator with no Ajv runtime dependency', async () => {
		const source = await readFile(
			join(packageDirectory, 'src/generated/validate-chart-scene.ts'),
			'utf8',
		);

		expect(source).not.toMatch(/(?:from|require\()[\"']ajv(?:\/|[\"'])/);
	});

	it('generates public types without any', async () => {
		const source = await readFile(
			join(packageDirectory, 'src/generated/chart-scene.ts'),
			'utf8',
		);

		expect(source).not.toMatch(/\bany\b/);
	});

	it('exports both the schema and parser from the package entry point', () => {
		expect(ChartSceneSchema.$id).toBe(
			'https://baron.dev/kline-scene/chart-scene.schema.json',
		);
		expect(parseChartScene(makeScene()).schema).toBe('@baron1996/kline-scene');
	});
});
