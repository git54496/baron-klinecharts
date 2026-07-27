import { describe, expect, it } from 'vitest';

import { SCENE_PACKAGE_VERSION } from '../src/index.js';

describe('scene schema package', () => {
	it('exposes the fixed package version', () => {
		expect(SCENE_PACKAGE_VERSION).toBe('0.1.0');
	});
});
