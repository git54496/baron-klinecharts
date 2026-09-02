import type { ChartScene, MarketData } from '@baron1996/kline-scene-schema';
import { parseChartScene } from '@baron1996/kline-scene-schema';
import { describe, expect, it } from 'vitest';

import {
	engineHistoricalDataForScene,
	gapAwareCandleIndicatorTemplate,
	timelineItemOf,
	timelineSlotCount,
	toGapAwareCarrierData,
} from '../src/gap-aware-series.js';
import { loadScene } from './load-scene.js';

function bar(timestamp: number, close: number): MarketData {
	return {
		timestamp,
		open: close - 0.2,
		high: close + 0.3,
		low: close - 0.4,
		close,
		volume: 100,
	};
}

function gap(timestamp: number) {
	return {
		timestamp,
		barEnd: timestamp + 60_000,
		classification: 'UNKNOWN_MISSING',
		reasonCode: 'ALL_SOURCES_EMPTY',
		retryable: true,
	} as const;
}

function gapScene(): ChartScene {
	const base = loadScene('minimal-valid.json');
	const start = base.data[0]!.timestamp;
	return parseChartScene({
		...base,
		version: 2,
		data: [
			bar(start, 10),
			bar(start + 60_000, 10.2),
			bar(start + 180_000, 10.3),
			bar(start + 360_000, 10.4),
		],
		gaps: [
			gap(start + 120_000),
			gap(start + 240_000),
			gap(start + 300_000),
		],
		viewport: { ...base.viewport, anchorTimestamp: start + 360_000 },
	});
}

describe('Gap-aware main series carrier', () => {
	it('preserves K K □ K □ □ K as seven stable timeline slots', () => {
		const scene = gapScene();
		const carriers = toGapAwareCarrierData(scene);
		expect(timelineSlotCount(scene)).toBe(7);
		expect(carriers.map((item) => timelineItemOf(item)?.kind)).toEqual([
			'bar',
			'bar',
			'gap',
			'bar',
			'gap',
			'gap',
			'bar',
		]);
		expect(timelineItemOf(carriers[2])?.kind).toBe('gap');
		expect('open' in scene.gaps![0]!).toBe(false);
	});

	it('uses zero only in the private carrier and returns null candle facts for Gap', () => {
		const carriers = toGapAwareCarrierData(gapScene());
		const gapCarrier = carriers[2]!;
		expect(gapCarrier.open).toBe(0);
		expect(gapCarrier.close).toBe(0);
		const values = gapAwareCandleIndicatorTemplate.calc(
			carriers,
			{} as never,
		);
		expect(values[0]).toMatchObject({ open: 9.8, close: 10 });
		expect(values[2]).toEqual({
			open: null,
			high: null,
			low: null,
			close: null,
		});
	});

	it('wraps prepended historical bars as visible Gap-aware carriers', () => {
		const scene = gapScene();
		const historical = [bar(scene.data[0]!.timestamp - 60_000, 9.7)];
		const carriers = engineHistoricalDataForScene(scene, historical);
		expect(carriers).toHaveLength(1);
		expect(timelineItemOf(carriers[0])).toEqual({
			kind: 'bar',
			bar: historical[0],
		});
		const values = gapAwareCandleIndicatorTemplate.calc(carriers, {} as never);
		expect(values[0]).toMatchObject({ open: 9.5, close: 9.7 });
	});
});
