import { describe, expect, it } from 'vitest';

import minimalSceneFixture from '../../../tests/fixtures/scenes/minimal-valid.json';
import allDrawingsFixture from '../../../tests/fixtures/drawings/all-drawings.json';
import chartWorkspaceFixture from '../../../tests/fixtures/workspaces/chart-minimal.json';
import timeProjectionCases from '../../../tests/fixtures/drawings/time-projection-cases.json';
import {
	DrawingProjectionError,
	DrawingProjectionService,
	type ProjectionScene,
} from '../src/index.js';

function chartSceneWithData(
	timestamps: readonly number[],
	timezone = 'America/New_York',
): Record<string, unknown> {
	const scene = structuredClone(minimalSceneFixture);
	scene.chart.timezone = timezone;
	scene.period = { type: 'day', span: 1 };
	scene.data = timestamps.map((timestamp, index) => ({
		timestamp,
		open: 12.34 + index,
		high: 12.68 + index,
		low: 12.21 + index,
		close: 12.55 + index,
		volume: 1000 + index,
		turnover: 10_000 + index,
	}));
	return scene;
}

function projectionScene(
	document: Record<string, unknown>,
): ProjectionScene {
	return { kind: 'chart', document } as unknown as ProjectionScene;
}

function anchorsFor(
	service: DrawingProjectionService,
	scene: Record<string, unknown>,
	drawing: Record<string, unknown>,
) {
	const projected = service.projectDrawing({
		scene: projectionScene(scene),
		drawing: drawing as never,
		valueAxes: [
			{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 2 },
		],
		path: '/drawings/0',
	});
	return projected.anchors;
}

function rayLineWithPoint(
	timestamp: number,
	granularity: { readonly type: string; readonly span: number },
	value = 12.55,
): Record<string, unknown> {
	const drawing = structuredClone(
		allDrawingsFixture.drawings.find((item) => item.type === 'rayLine'),
	)!;
	drawing.geometry.points[0] = { timestamp, granularity, value };
	drawing.geometry.points[1] = {
		timestamp: timestamp + 86_400_000,
		granularity,
		value,
	};
	return drawing;
}

function verticalLine(timestamp: number): Record<string, unknown> {
	const drawing = structuredClone(
		allDrawingsFixture.drawings.find(
			(item) => item.type === 'verticalStraightLine',
		),
	)!;
	drawing.geometry.time = timestamp;
	return drawing;
}

describe('DrawingProjectionService calendar semantics', () => {
	it('adds periods with timezone calendar rules including DST and month ends', () => {
		const service = new DrawingProjectionService();
		for (const entry of timeProjectionCases.calendarCases) {
			const actual = service.addPeriod(
				entry.timestamp,
				entry.period,
				timeProjectionCases.timezone,
			);
			expect(actual).toBe(entry.expected);
		}
	});
});

describe('DrawingProjectionService time buckets', () => {
	const service = new DrawingProjectionService();
	const scene = chartSceneWithData(timeProjectionCases.dataTimestamps);

	it.each(timeProjectionCases.bucketCases)(
		'projects $name',
		({ anchor, expected }) => {
			const drawing =
				anchor.granularity.type === 'day' &&
				anchor.timestamp % 86_400_000 === 0
					? verticalLine(anchor.timestamp)
					: rayLineWithPoint(anchor.timestamp, anchor.granularity);
			const anchors = anchorsFor(service, scene, drawing);
			const bucket = anchors[0]?.bucket;
			expect(bucket?.kind).toBe(expected.kind);
			expect(bucket?.startTimestamp).toBe(expected.startTimestamp);
			expect(bucket?.endTimestamp).toBe(expected.endTimestamp);
			expect(bucket?.dataIndex).toBe(expected.dataIndex);
		},
	);

	it('keeps drawings outside the data range in the document as invisible', () => {
		const drawing = verticalLine(
			timeProjectionCases.dataTimestamps.at(-1)! + 86_400_000,
		);
		const projected = service.projectDrawing({
			scene: projectionScene(scene),
			drawing: drawing as never,
			valueAxes: [
				{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 2 },
			],
			path: '/drawings/0',
		});
		expect(projected.visible).toBe(false);
		expect(projected.drawing).toEqual(drawing);
	});

	it('projects all 22 geometry types with their anchor counts', () => {
		const chartScene = structuredClone(
			chartWorkspaceFixture.scene.document,
		);
		const projected = service.projectDocument({
			scene: projectionScene(chartScene as unknown as Record<string, unknown>),
			drawings: allDrawingsFixture as never,
		});
		expect(projected.drawings).toHaveLength(22);
		const counts = new Map(
			projected.drawings.map((entry) => [
				entry.drawing.type,
				entry.anchors.length,
			]),
		);
		expect(counts.get('horizontalStraightLine')).toBe(0);
		expect(counts.get('verticalStraightLine')).toBe(1);
		expect(counts.get('rayLine')).toBe(2);
		expect(counts.get('brush')).toBe(3);
		expect(counts.get('rectangle')).toBe(2);
		expect(projected.drawings.every((entry) => entry.visible)).toBe(true);
	});

	it('rejects non-positive values on a logarithmic axis', () => {
		const logarithmic = structuredClone(chartWorkspaceFixture.scene.document);
		const pane = logarithmic.panes.find(
			(candidate: { kind: string }) => candidate.kind === 'candle',
		);
		pane.yAxes[0].scale = 'logarithmic';
		const drawing = structuredClone(allDrawingsFixture.drawings[0]);
		drawing.geometry.value = 0;
		expect(() =>
			service.projectDrawing({
				scene: projectionScene(logarithmic as unknown as Record<string, unknown>),
				drawing,
				valueAxes: [
					{
						paneRole: 'candle',
						yAxisRole: 'primary',
						valuePrecision: 2,
					},
				],
				path: '/drawings/0',
			}),
		).toThrowError(
			expect.objectContaining({
				code: 'VALUE_AXIS_SCALE_UNSUPPORTED',
			}),
		);
	});
});

describe('DrawingProjectionService reverse projection', () => {
	const service = new DrawingProjectionService();
	const data = timeProjectionCases.dataTimestamps.map((timestamp) => ({
		timestamp,
	}));

	it.each(timeProjectionCases.reverseCases)(
		'reverses $name',
		({ original, editingPeriod, target, expected }) => {
			const actual = service.reverseProjectAnchor({
				original,
				editingScenePeriod: editingPeriod,
				targetTimestamp: target,
				data,
				scenePeriod: timeProjectionCases.scenePeriod,
				timezone: timeProjectionCases.timezone,
			});
			expect(actual).toEqual(expected);
		},
	);

	it('keeps time unchanged for vertical-only edits and normalizes precision', () => {
		const drawing = structuredClone(
			allDrawingsFixture.drawings.find((item) => item.type === 'rayLine'),
		)!;
		const before = structuredClone(drawing);
		const candidate = service.reverseProjectDrawing({
			scene: projectionScene(
				chartSceneWithData(
					timeProjectionCases.dataTimestamps,
					'America/New_York',
				),
			),
			drawing,
			valueAxes: [
				{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 2 },
			],
			path: '/drawings/0',
			vertical: { values: [12.345, 12.365] },
		});
		expect(candidate.geometry.points[0].timestamp).toBe(
			before.geometry.points[0].timestamp,
		);
		expect(candidate.geometry.points[0].value).toBe(12.35);
		expect(candidate.geometry.points[1].value).toBe(12.37);
		expect(candidate.geometry.points[0].granularity).toEqual(
			before.geometry.points[0].granularity,
		);
	});

	it('applies horizontal and vertical edits together and canonicalizes negative zero', () => {
		const drawing = structuredClone(
			allDrawingsFixture.drawings.find((item) => item.type === 'rayLine'),
		)!;
		const candidate = service.reverseProjectDrawing({
			scene: projectionScene(
				chartSceneWithData(timeProjectionCases.dataTimestamps),
			),
			drawing,
			valueAxes: [
				{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 2 },
			],
			path: '/drawings/0',
			horizontal: {
				targetTimestamp: timeProjectionCases.dataTimestamps[2]! + 3_600_000,
				editingScenePeriod: { type: 'day', span: 1 },
			},
			vertical: { values: [-0.004, 12.34] },
		});
		expect(candidate.geometry.points[0].timestamp).toBe(
			timeProjectionCases.dataTimestamps[2],
		);
		expect(candidate.geometry.points[0].value).toBe(0);
		expect(Object.is(candidate.geometry.points[0].value, -0)).toBe(false);
	});

	it('uses indicator precision for vertical edits on indicator targets', () => {
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
		const drawing = structuredClone(allDrawingsFixture.drawings[0]);
		drawing.target = {
			paneRole: 'indicator:indicator-ma-0',
			yAxisRole: 'primary',
		};
		const candidate = service.reverseProjectDrawing({
			scene: projectionScene(scene as unknown as Record<string, unknown>),
			drawing,
			valueAxes: [
				{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 2 },
				{
					paneRole: 'indicator:indicator-ma-0',
					yAxisRole: 'primary',
					valuePrecision: 6,
				},
			],
			path: '/drawings/0',
			vertical: { values: [12.3456789] },
		});
		expect(candidate.geometry.value).toBe(12.345679);
	});

	it('rejects targets outside the Scene data range', () => {
		expect(() =>
			service.reverseProjectAnchor({
				original: {
					timestamp: timeProjectionCases.dataTimestamps[0]!,
					granularity: { type: 'day', span: 1 },
				},
				editingScenePeriod: { type: 'day', span: 1 },
				targetTimestamp:
					timeProjectionCases.dataTimestamps.at(-1)! + 10 * 86_400_000,
				data,
				scenePeriod: timeProjectionCases.scenePeriod,
				timezone: timeProjectionCases.timezone,
			}),
		).toThrowError(
			expect.objectContaining({
				code: 'DRAWING_PROJECTION_INVALID',
			}),
		);
	});

	it('does not mutate the confirmed drawing', () => {
		const drawing = structuredClone(
			allDrawingsFixture.drawings.find((item) => item.type === 'rayLine'),
		)!;
		const before = structuredClone(drawing);
		service.reverseProjectDrawing({
			scene: projectionScene(
				chartSceneWithData(timeProjectionCases.dataTimestamps),
			),
			drawing,
			valueAxes: [
				{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 2 },
			],
			path: '/drawings/0',
			vertical: { values: [1, 2] },
		});
		expect(drawing).toEqual(before);
	});
});
