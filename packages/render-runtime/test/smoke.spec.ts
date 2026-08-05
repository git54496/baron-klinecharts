import { describe, expect, it } from 'vitest';

import { RENDER_RUNTIME_PACKAGE_VERSION } from '../src/index.js';

describe('render runtime package', () => {
	it('exposes the fixed package version', () => {
		expect(RENDER_RUNTIME_PACKAGE_VERSION).toBe('0.4.1');
	});
});
