import { describe, expect, it } from 'vitest';

import areaSceneFixture from '../../../tests/fixtures/scenes/chart-area-close-line.json';
import minimalSceneFixture from '../../../tests/fixtures/scenes/minimal-valid.json';
import allDrawingsFixture from '../../../tests/fixtures/drawings/all-drawings.json';
import chartWorkspaceFixture from '../../../tests/fixtures/workspaces/chart-minimal.json';
import { KLineDrawingProjectionPolicy } from '../src/drawing/kline-projection-policy.js';
import {
	DrawingProjectionError,
	type ProjectionScene,
	type ResolveAxisBindingInput,
} from '../src/drawing/projection-policy.js';

const candleAxes = [
	{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 2 },
] as const;

function chartInput(
	document: Record<string, unknown>,
	drawing: Record<string, unknown>,
	valueAxes: readonly Record<string, unknown>[] = candleAxes,
): ResolveAxisBindingInput {
	return {
		scene: { kind: 'chart', document } as unknown as ProjectionScene,
		drawing: drawing as never,
		valueAxes: valueAxes as never,
		path: '/drawings/0',
	};
}

function candleDrawing(): Record<string, unknown> {
	return {
		...structuredClone(allDrawingsFixture.drawings[0]),
		target: { paneRole: 'candle', yAxisRole: 'primary' },
	};
}

function indicatorScene(): Record<string, unknown> {
	const scene = structuredClone(chartWorkspaceFixture.scene.document);
	scene.panes.push({
		id: 'pane-indicators',
		kind: 'indicator',
		order: 1,
		height: 240,
		minHeight: 100,
		state: 'normal',
		yAxes: [
			{
				id: 'axis-indicators',
				role: 'primary',
				position: 'right',
				reverse: false,
				inside: false,
				scrollZoomEnabled: true,
				topGap: 0.1,
				bottomGap: 0.1,
				scale: 'linear',
			},
		],
		indicators: [
			{
				id: 'indicator-ma-0',
				name: 'MA',
				paneId: 'pane-indicators',
				yAxisId: 'axis-indicators',
				calcParams: [5, 10, 30, 60],
				precision: 6,
				visible: true,
				zLevel: 0,
				styles: {
					lines: [
						{
							color: 'rgba(41, 98, 255, 1)',
							size: 1,
							style: 'solid',
						},
					],
					bars: [],
					circles: [],
				},
			},
		],
	});
	return scene;
}

function expectTargetError(
	input: ResolveAxisBindingInput,
	path: string,
): void {
	try {
		new KLineDrawingProjectionPolicy().resolveAxisBinding(input);
		expect.fail('Expected DrawingProjectionError.');
	} catch (error) {
		expect(error).toBeInstanceOf(DrawingProjectionError);
		expect((error as DrawingProjectionError).code).toBe(
			'DRAWING_TARGET_INVALID',
		);
		expect((error as DrawingProjectionError).path).toBe(path);
	}
}

describe('KLineDrawingProjectionPolicy', () => {
	it('resolves candle primary binding with symbol precision and linear scale', () => {
		const binding = new KLineDrawingProjectionPolicy().resolveAxisBinding(
			chartInput(chartWorkspaceFixture.scene.document, candleDrawing()),
		);
		expect(binding).toEqual({
			paneRole: 'candle',
			yAxisRole: 'primary',
			valuePrecision: 2,
			scale: 'linear',
		});
	});

	it('returns the same binding for candle, OHLC and area presentations', () => {
		const policy = new KLineDrawingProjectionPolicy();
		const candle = policy.resolveAxisBinding(
			chartInput(chartWorkspaceFixture.scene.document, candleDrawing()),
		);
		const area = policy.resolveAxisBinding(
			chartInput(areaSceneFixture as unknown as Record<string, unknown>, candleDrawing()),
		);
		expect(area).toEqual(candle);
		expect(area.paneRole).toBe('candle');
	});

	it('reports logarithmic scale from the candle primary axis', () => {
		const scene = structuredClone(chartWorkspaceFixture.scene.document);
		const pane = scene.panes.find(
			(candidate: { kind: string }) => candidate.kind === 'candle',
		);
		pane.yAxes[0].scale = 'logarithmic';
		const binding = new KLineDrawingProjectionPolicy().resolveAxisBinding(
			chartInput(scene, candleDrawing()),
		);
		expect(binding.scale).toBe('logarithmic');
	});

	it('resolves a primary-bound indicator with its own precision', () => {
		const drawing = candleDrawing();
		drawing.target = {
			paneRole: 'indicator:indicator-ma-0',
			yAxisRole: 'primary',
		};
		const valueAxes = [
			...candleAxes,
			{
				paneRole: 'indicator:indicator-ma-0',
				yAxisRole: 'primary',
				valuePrecision: 6,
			},
		];
		const binding = new KLineDrawingProjectionPolicy().resolveAxisBinding(
			chartInput(indicatorScene(), drawing, valueAxes),
		);
		expect(binding).toEqual({
			paneRole: 'indicator:indicator-ma-0',
			yAxisRole: 'primary',
			valuePrecision: 6,
			scale: 'linear',
		});
	});

	it('rejects non-primary targets, unknown roles and unresolved indicators', () => {
		const policy = new KLineDrawingProjectionPolicy();
		const nonPrimary = candleDrawing();
		nonPrimary.target = { paneRole: 'candle', yAxisRole: 'additional' };
		expectTargetError(
			chartInput(chartWorkspaceFixture.scene.document, nonPrimary),
			'/drawings/0/target/yAxisRole',
		);

		const unknownRole = candleDrawing();
		unknownRole.target = { paneRole: 'unknown-role', yAxisRole: 'primary' };
		expectTargetError(
			chartInput(chartWorkspaceFixture.scene.document, unknownRole),
			'/drawings/0/target/paneRole',
		);

		const missingIndicator = candleDrawing();
		missingIndicator.target = {
			paneRole: 'indicator:missing',
			yAxisRole: 'primary',
		};
		expectTargetError(
			chartInput(indicatorScene(), missingIndicator, [
				...candleAxes,
				{
					paneRole: 'indicator:missing',
					yAxisRole: 'primary',
					valuePrecision: 6,
				},
			]),
			'/drawings/0/target',
		);
	});

	it('rejects precision mismatches and additional-axis indicators', () => {
		const policy = new KLineDrawingProjectionPolicy();
		const candleMismatch = chartInput(
			chartWorkspaceFixture.scene.document,
			candleDrawing(),
			[
				{
					paneRole: 'candle',
					yAxisRole: 'primary',
					valuePrecision: 6,
				},
			],
		);
		expectTargetError(candleMismatch, '/drawings/0/target');

		const indicator = candleDrawing();
		indicator.target = {
			paneRole: 'indicator:indicator-ma-0',
			yAxisRole: 'primary',
		};
		const scene = indicatorScene();
		const pane = scene.panes.find(
			(candidate: { id: string }) => candidate.id === 'pane-indicators',
		);
		pane.yAxes.push({
			...pane.yAxes[0],
			id: 'axis-additional',
			role: 'additional',
		});
		pane.indicators[0].yAxisId = 'axis-additional';
		expectTargetError(
			chartInput(scene, indicator, [
				...candleAxes,
				{
					paneRole: 'indicator:indicator-ma-0',
					yAxisRole: 'primary',
					valuePrecision: 6,
				},
			]),
			'/drawings/0/target',
		);
	});

	it('rejects a time-series scene', () => {
		const input: ResolveAxisBindingInput = {
			scene: {
				kind: 'time-series',
				document: minimalSceneFixture as never,
			},
			drawing: candleDrawing() as never,
			valueAxes: candleAxes as never,
			path: '/drawings/0',
		};
		try {
			new KLineDrawingProjectionPolicy().resolveAxisBinding(input);
			expect.fail('Expected DrawingProjectionError.');
		} catch (error) {
			expect((error as DrawingProjectionError).code).toBe(
				'DRAWING_PROJECTION_INVALID',
			);
		}
	});
});
