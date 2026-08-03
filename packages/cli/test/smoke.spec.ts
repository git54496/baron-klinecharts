import { describe, expect, it } from 'vitest';

import { CLI_PACKAGE_VERSION } from '../src/cli.js';

describe('cli package', () => {
	it('exposes the fixed package version', () => {
		expect(CLI_PACKAGE_VERSION).toBe('0.3.0');
	});
});
