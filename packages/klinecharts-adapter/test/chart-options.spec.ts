import { describe, expect, it } from 'vitest';

import { toKLineChartsOptions } from '../src/conversion/chart-options.js';
import { loadScene } from './load-scene.js';

function formatDate(
	options: ReturnType<typeof toKLineChartsOptions>,
	type: 'tooltip' | 'crosshair' | 'xAxis',
): string {
	const formatter = options.formatter?.formatDate;
	if (formatter === undefined) {
		throw new Error('Expected a date formatter.');
	}
	return formatter({
		dateTimeFormat: new Intl.DateTimeFormat('en-CA', {
			timeZone: options.timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23',
		}),
		timestamp: Date.UTC(2026, 7, 30, 12),
		template: '',
		type,
	});
}

describe('chart display timezone', () => {
	it('uses the runtime timezone and labels tooltip dates without cluttering the x axis', () => {
		const scene = loadScene('minimal-valid.json');
		const options = toKLineChartsOptions(
			{ ...scene.chart, dateFormat: 'yyyy-MM-dd HH:mm' },
			'UTC',
		);

		expect(options.timezone).toBe('UTC');
		expect(formatDate(options, 'tooltip')).toBe('2026-08-30 12:00 UTC');
		expect(formatDate(options, 'crosshair')).toBe('2026-08-30 12:00');
		expect(formatDate(options, 'xAxis')).toBe('2026-08-30 12:00');
	});

	it('preserves the scene timezone and legacy tooltip text when no override is provided', () => {
		const scene = loadScene('minimal-valid.json');
		const options = toKLineChartsOptions({
			...scene.chart,
			timezone: 'UTC',
			dateFormat: 'yyyy-MM-dd HH:mm',
		});

		expect(options.timezone).toBe('UTC');
		expect(formatDate(options, 'tooltip')).toBe('2026-08-30 12:00');
	});
});
