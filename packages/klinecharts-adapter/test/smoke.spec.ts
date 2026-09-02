import { describe, expect, it } from 'vitest';

import { ADAPTER_PACKAGE_VERSION } from '../src/index.js';

describe('klinecharts adapter package', () => {
	it('exposes the fixed package version', () => {
		expect(ADAPTER_PACKAGE_VERSION).toBe('0.9.11');
	});
});
