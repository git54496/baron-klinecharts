import { describe, expect, it } from 'vitest';

import allIndicators from '../../../tests/fixtures/scenes/all-indicators.json';
import invalidIndicatorReference from '../../../tests/fixtures/scenes/invalid-indicator-reference.json';
import { parseChartScene, SceneError } from '../src/index.js';
import {
	addIndicatorPane,
	INDICATOR_NAMES,
	makeIndicator,
	makeScene,
} from './helpers/scene.js';

describe('built-in indicator schema', () => {
	it('accepts the complete static Indicator fixture', () => {
		expect(parseChartScene(allIndicators).panes[1]?.indicators).toHaveLength(27);
	});

	it('rejects the invalid Indicator-reference fixture', () => {
		expect(() => parseChartScene(invalidIndicatorReference)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'INVALID_REFERENCE' }),
		);
	});

	it.each(INDICATOR_NAMES)('accepts %s with its exact parameter shape', (name) => {
		const scene = makeScene();
		addIndicatorPane(scene, makeIndicator(name));
		expect(parseChartScene(scene).panes[1]?.indicators[0]?.name).toBe(name);
	});

	it('rejects an unknown indicator name', () => {
		const scene = makeScene();
		const indicator = makeIndicator('MA');
		(indicator as { name: string }).name = 'CUSTOM';
		addIndicatorPane(scene, indicator);
		expect(() => parseChartScene(scene)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'UNKNOWN_INDICATOR' }),
		);
	});

	it('accepts M3 MA with five independent calculation parameters', () => {
		const scene = makeScene();
		const indicator = makeIndicator('MA');
		indicator.calcParams = [18, 45, 60, 200, 250];
		addIndicatorPane(scene, indicator);
		expect(parseChartScene(scene).panes[1]?.indicators[0]?.calcParams).toEqual(
			[18, 45, 60, 200, 250],
		);
	});

	it('rejects a Y-axis reference outside the containing Pane', () => {
		const scene = makeScene();
		const indicator = makeIndicator('MACD');
		addIndicatorPane(scene, indicator);
		indicator.yAxisId = 'axis-price';
		expect(() => parseChartScene(scene)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'INVALID_REFERENCE' }),
		);
	});

	it('rejects the wrong calculation parameter count', () => {
		const scene = makeScene();
		const indicator = makeIndicator('MACD');
		indicator.calcParams = [12, 26];
		addIndicatorPane(scene, indicator);
		expect(() => parseChartScene(scene)).toThrowError(
			expect.objectContaining<Partial<SceneError>>({ code: 'SCENE_SCHEMA_INVALID' }),
		);
	});
});
