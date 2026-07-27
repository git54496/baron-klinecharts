import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
	createKLineSceneRuntime,
	KLineSceneRuntime,
} from '../src/index.js';

describe('Web Runtime public API', () => {
	it('exports the Runtime factory', () => {
		expect(createKLineSceneRuntime).toBeTypeOf('function');
	});

	it('contains the complete pure-scene method surface and no engine getter', () => {
		const methods = Object.getOwnPropertyNames(KLineSceneRuntime.prototype);
		expect(methods).toEqual(
			expect.arrayContaining([
				'getScene',
				'exportScene',
				'startOverlayDrawing',
				'addOverlay',
				'updateOverlay',
				'removeOverlay',
				'getOverlay',
				'listOverlays',
				'subscribe',
				'destroy',
			]),
		);
		expect(methods).not.toEqual(
			expect.arrayContaining(['getChart', 'getEngine', 'undo', 'redo']),
		);
	});

	it('does not use innerHTML in the standard toolbar implementation', async () => {
		const source = await readFile(
			new URL('../src/toolbar/standard-toolbar.ts', import.meta.url),
			'utf8',
		);
		expect(source).not.toContain('innerHTML');
	});
});
