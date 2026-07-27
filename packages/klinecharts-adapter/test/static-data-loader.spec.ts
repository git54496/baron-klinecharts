import { describe, expect, it } from 'vitest';

import minimalScene from '../../../tests/fixtures/scenes/minimal-valid.json';
import { createStaticDataLoader } from '../src/static-data-loader.js';

function collectBars(
	loader: ReturnType<typeof createStaticDataLoader>,
	type: 'init' | 'forward',
): Promise<unknown[]> {
	return new Promise((resolve) => {
		void loader.getBars({
			type,
			timestamp: null,
			symbol: minimalScene.symbol,
			period: minimalScene.period,
			callback: (data) => resolve(data),
		});
	});
}

describe('static KLineCharts DataLoader', () => {
	it('returns the exact embedded bars only for init', async () => {
		const loader = createStaticDataLoader(minimalScene.data);
		const init = await collectBars(loader, 'init');
		const forward = await collectBars(loader, 'forward');

		expect(init).toEqual(minimalScene.data);
		expect(forward).toEqual([]);
		expect(init).not.toBe(minimalScene.data);
	});

	it('returns a fresh deep clone on every init request', async () => {
		const loader = createStaticDataLoader(minimalScene.data);
		const first = await collectBars(loader, 'init');
		(first[0] as { close: number }).close = 0;
		const second = await collectBars(loader, 'init');

		expect(second).toEqual(minimalScene.data);
	});

	it('does not expose streaming subscription callbacks', () => {
		const loader = createStaticDataLoader(minimalScene.data);
		expect(loader.subscribeBar).toBeUndefined();
		expect(loader.unsubscribeBar).toBeUndefined();
	});
});
