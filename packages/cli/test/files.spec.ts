import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertDistinctInputOutput, writeOutputAtomic } from '../src/files.js';

describe('atomic output', () => {
	it('creates and explicitly replaces an output', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-cli-files-'));
		const output = join(directory, 'scene.json');
		await writeOutputAtomic(output, 'first', false);
		await expect(writeOutputAtomic(output, 'second', false)).rejects.toMatchObject({
			code: 'OUTPUT_EXISTS',
		});
		await writeOutputAtomic(output, 'second', true);
		expect(await readFile(output, 'utf8')).toBe('second');
	});

	it('rejects input and output paths that resolve to the same file', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-cli-files-'));
		const input = join(directory, 'scene.json');
		await writeFile(input, '{}');
		expect(() => assertDistinctInputOutput(input, join(directory, '.', 'scene.json'))).toThrowError(
			expect.objectContaining({ code: 'INPUT_OUTPUT_CONFLICT' }),
		);
	});
});
