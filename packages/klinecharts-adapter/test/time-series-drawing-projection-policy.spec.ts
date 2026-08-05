import { describe, expect, it } from 'vitest';

import allDrawingsFixture from '../../../tests/fixtures/drawings/all-drawings.json';
import timeSeriesWorkspaceFixture from '../../../tests/fixtures/workspaces/time-series-minimal.json';
import { TimeSeriesDrawingProjectionPolicy } from '../src/drawing/time-series-projection-policy.js';
import {
	DrawingProjectionError,
	type ResolveAxisBindingInput,
} from '../src/drawing/projection-policy.js';

const axes = [
	{ paneRole: 'time-series', yAxisRole: 'primary', valuePrecision: 2 },
] as const;

function input(
	drawing: Record<string, unknown>,
	valueAxes: readonly Record<string, unknown>[] = axes,
): ResolveAxisBindingInput {
	return {
		scene: {
			kind: 'time-series',
			document: timeSeriesWorkspaceFixture.scene.document,
		} as never,
		drawing: drawing as never,
		valueAxes: valueAxes as never,
		path: '/drawings/0',
	};
}

function drawing(): Record<string, unknown> {
	return {
		...structuredClone(allDrawingsFixture.drawings[0]),
		target: { paneRole: 'time-series', yAxisRole: 'primary' },
	};
}

describe('TimeSeriesDrawingProjectionPolicy', () => {
	it('resolves the shared public axis with linear scale', () => {
		const binding = new TimeSeriesDrawingProjectionPolicy().resolveAxisBinding(
			input(drawing()),
		);
		expect(binding).toEqual({
			paneRole: 'time-series',
			yAxisRole: 'primary',
			valuePrecision: 2,
			scale: 'linear',
		});
	});

	it('rejects non-public targets and precision mismatches', () => {
		const policy = new TimeSeriesDrawingProjectionPolicy();
		const wrongRole = drawing();
		wrongRole.target = { paneRole: 'time-series', yAxisRole: 'additional' };
		try {
			policy.resolveAxisBinding(input(wrongRole));
			expect.fail('Expected DrawingProjectionError.');
		} catch (error) {
			expect((error as DrawingProjectionError).code).toBe(
				'DRAWING_TARGET_INVALID',
			);
			expect((error as DrawingProjectionError).path).toBe(
				'/drawings/0/target',
			);
		}

		try {
			policy.resolveAxisBinding(
				input(drawing(), [
					{
						paneRole: 'time-series',
						yAxisRole: 'primary',
						valuePrecision: 6,
					},
				]),
			);
			expect.fail('Expected DrawingProjectionError.');
		} catch (error) {
			expect((error as DrawingProjectionError).code).toBe(
				'DRAWING_TARGET_INVALID',
			);
		}
	});

	it('rejects a chart scene', () => {
		const inputValue: ResolveAxisBindingInput = {
			scene: {
				kind: 'chart',
				document: timeSeriesWorkspaceFixture.scene.document,
			} as never,
			drawing: drawing() as never,
			valueAxes: axes as never,
			path: '/drawings/0',
		};
		try {
			new TimeSeriesDrawingProjectionPolicy().resolveAxisBinding(inputValue);
			expect.fail('Expected DrawingProjectionError.');
		} catch (error) {
			expect((error as DrawingProjectionError).code).toBe(
				'DRAWING_PROJECTION_INVALID',
			);
		}
	});
});
