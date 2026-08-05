import { describe, expect, it } from 'vitest';

import minimalScene from '../../../tests/fixtures/scenes/minimal-valid.json';
import chartAreaCloseLine from '../../../tests/fixtures/scenes/chart-area-close-line.json';
import invalidAreaBackground from '../../../tests/fixtures/scenes/invalid-chart-area-background.json';
import invalidAreaLineColor from '../../../tests/fixtures/scenes/invalid-chart-area-line-color.json';
import invalidAreaLineSize from '../../../tests/fixtures/scenes/invalid-chart-area-line-size.json';
import invalidAreaMissingConfig from '../../../tests/fixtures/scenes/invalid-chart-area-missing-config.json';
import invalidAreaNonClose from '../../../tests/fixtures/scenes/invalid-chart-area-non-close.json';
import invalidAreaPointVisible from '../../../tests/fixtures/scenes/invalid-chart-area-point-visible.json';
import invalidAreaSmooth from '../../../tests/fixtures/scenes/invalid-chart-area-smooth.json';
import invalidNonAreaResidual from '../../../tests/fixtures/scenes/invalid-chart-non-area-residual.json';
import { parseChartScene, SceneError } from '../src/index.js';

const oldTypes = [
	'candle_solid',
	'candle_stroke',
	'candle_up_stroke',
	'candle_down_stroke',
	'ohlc',
] as const;

function sceneWithType(type: string): Record<string, unknown> {
	const scene = structuredClone(minimalScene);
	scene.chart.candle.type = type;
	return scene;
}

function expectAreaRejected(value: unknown): void {
	try {
		parseChartScene(value);
		expect.fail('Expected area Scene validation to fail.');
	} catch (error) {
		expect(error).toBeInstanceOf(SceneError);
		const sceneError = error as SceneError;
		expect(sceneError.code).toBe('SCENE_SCHEMA_INVALID');
		expect(sceneError.path.startsWith('/chart/candle')).toBe(true);
	}
}

describe('ChartScene main series presentation', () => {
	it('accepts the frozen area close-line presentation', () => {
		const parsed = parseChartScene(chartAreaCloseLine);
		expect(parsed.chart.candle.type).toBe('area');
		expect(parsed.chart.candle.area).toEqual({
			value: 'close',
			line: { color: 'rgba(41, 98, 255, 1)', size: 2 },
			backgroundColor: 'rgba(0, 0, 0, 0)',
			smooth: false,
			pointVisible: false,
		});
	});

	it('keeps all five legacy types without residual area state', () => {
		for (const type of oldTypes) {
			const parsed = parseChartScene(sceneWithType(type));
			expect(parsed.chart.candle.type).toBe(type);
			expect('area' in parsed.chart.candle).toBe(false);
		}
	});

	it.each([
		['missing-config', invalidAreaMissingConfig],
		['non-close', invalidAreaNonClose],
		['line-color', invalidAreaLineColor],
		['line-size', invalidAreaLineSize],
		['background', invalidAreaBackground],
		['smooth', invalidAreaSmooth],
		['point-visible', invalidAreaPointVisible],
		['non-area-residual', invalidNonAreaResidual],
	] as const)('rejects invalid area presentation %s', (_name, fixture) => {
		expectAreaRejected(fixture);
	});
});
