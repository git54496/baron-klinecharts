import { describe, expect, it } from 'vitest';

import { WEB_RUNTIME_PACKAGE_VERSION } from '../src/index.js';

describe('web runtime package', () => {
	it('exposes the fixed package version', () => {
		expect(WEB_RUNTIME_PACKAGE_VERSION).toBe('0.9.4');
	});
});
