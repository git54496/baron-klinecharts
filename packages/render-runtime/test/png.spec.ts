import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SceneError } from '@baron1996/kline-scene-schema';

import {
	launchPinnedChromium,
	renderScenePng,
} from '../src/png.js';
import { loadScene } from './load-scene.js';

function pngDimensions(bytes: Uint8Array): {
	readonly width: number;
	readonly height: number;
} {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		width: view.getUint32(16),
		height: view.getUint32(20),
	};
}

describe('deterministic PNG renderer', () => {
	it('maps a missing pinned browser to BROWSER_NOT_INSTALLED', async () => {
		await expect(
			launchPinnedChromium(async () => {
				throw new Error("Executable doesn't exist. Run playwright install chromium.");
			}),
		).rejects.toEqual(
			expect.objectContaining<Partial<SceneError>>({ code: 'BROWSER_NOT_INSTALLED' }),
		);
	});

	it.each([
		['minimal-valid.json', 'minimal.png'],
		['all-overlays.json', 'all-overlays.png'],
		['all-indicators.json', 'all-indicators.png'],
	])('matches the reviewed %s baseline', async (fixtureName, baselineName) => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-png-test-'));
		const output = join(directory, baselineName);
		try {
			const scene = loadScene(fixtureName);
			await renderScenePng(scene, output);
			const actual = await readFile(output);
			const baseline = await readFile(
				join(
					import.meta.dirname,
					'..',
					'..',
					'..',
					'tests',
					'rendering',
					'baselines',
					baselineName,
				),
			);

			expect(pngDimensions(actual)).toEqual({
				width: scene.render.width * scene.render.deviceScaleFactor,
				height: scene.render.height * scene.render.deviceScaleFactor,
			});
			expect(actual).toEqual(baseline);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('applies deviceScaleFactor to the captured chart root only', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-png-dpr-'));
		const output = join(directory, 'dpr.png');
		try {
			const scene = loadScene('minimal-valid.json');
			scene.render.width = 640;
			scene.render.height = 360;
			scene.render.deviceScaleFactor = 2;
			await renderScenePng(scene, output);

			expect(pngDimensions(await readFile(output))).toEqual({
				width: 1280,
				height: 720,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
