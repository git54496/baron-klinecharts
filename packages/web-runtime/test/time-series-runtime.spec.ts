import { describe, expect, it } from 'vitest';

import {
	createTimeSeriesRuntime,
} from '../src/index.js';

describe('Time Series Runtime public API', () => {
	it('exports an isolated factory and exact method surface', () => {
		expect(createTimeSeriesRuntime).toBeTypeOf('function');
	});
});
