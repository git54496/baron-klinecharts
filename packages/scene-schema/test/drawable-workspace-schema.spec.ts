import { describe, expect, it } from 'vitest';

import minimalScene from '../../../tests/fixtures/scenes/minimal-valid.json';
import chartMinimal from '../../../tests/fixtures/workspaces/chart-minimal.json';
import invalidDoubleAuthority from '../../../tests/fixtures/workspaces/invalid-double-authority.json';
import timeSeriesMinimal from '../../../tests/fixtures/workspaces/time-series-minimal.json';
import {
	DrawableWorkspaceError,
	parseChartScene,
	parseDrawableWorkspaceDocument,
} from '../src/index.js';

function expectIssue(value: unknown, code: string, path: string): void {
	try {
		parseDrawableWorkspaceDocument(value);
		expect.fail('Expected DrawableWorkspace validation to fail.');
	} catch (error) {
		expect(error).toBeInstanceOf(DrawableWorkspaceError);
		const workspaceError = error as DrawableWorkspaceError;
		expect(workspaceError.code).toBe(code);
		expect(workspaceError.path).toBe(path);
	}
}

describe('DrawableWorkspaceDocument schema and semantics', () => {
	it('accepts the chart and time-series workspace fixtures', () => {
		const chart = parseDrawableWorkspaceDocument(chartMinimal);
		expect(chart.scene.kind).toBe('chart');
		expect(chart.drawings.drawings).toHaveLength(22);
		expect(chart.scene.document.overlays).toHaveLength(0);

		const timeSeries = parseDrawableWorkspaceDocument(timeSeriesMinimal);
		expect(timeSeries.scene.kind).toBe('time-series');
		expect(timeSeries.binding.valueAxes[0]?.paneRole).toBe('time-series');
	});

	it('rejects double authority between legacy overlays and drawings', () => {
		expectIssue(
			invalidDoubleAuthority,
			'DRAWABLE_WORKSPACE_DOUBLE_AUTHORITY',
			'/scene/document/overlays',
		);
	});

	it('rejects binding mismatches', () => {
		const scopeMismatch = structuredClone(chartMinimal);
		scopeMismatch.binding.scopeKey = 'other-scope';
		expectIssue(
			scopeMismatch,
			'DRAWABLE_WORKSPACE_BINDING_MISMATCH',
			'/binding/scopeKey',
		);

		const axisMismatch = structuredClone(chartMinimal);
		axisMismatch.binding.valueAxes = [
			{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 6 },
		];
		expectIssue(
			axisMismatch,
			'DRAWABLE_WORKSPACE_BINDING_MISMATCH',
			'/binding/valueAxes',
		);
	});

	it('rejects a candle target precision that differs from the symbol precision', () => {
		const workspace = structuredClone(chartMinimal);
		workspace.drawings.coordinateSystem.valueAxes = [
			{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 6 },
		];
		workspace.binding.valueAxes = workspace.drawings.coordinateSystem.valueAxes;
		expectIssue(
			workspace,
			'DRAWING_TARGET_INVALID',
			'/drawings/0/target',
		);
	});

	it('rejects pane roles the declared Scene cannot interpret', () => {
		const workspace = structuredClone(chartMinimal);
		workspace.drawings.coordinateSystem.valueAxes = [
			{ paneRole: 'unknown-role', yAxisRole: 'primary', valuePrecision: 2 },
		];
		workspace.binding.valueAxes = workspace.drawings.coordinateSystem.valueAxes;
		for (const drawing of workspace.drawings.drawings) {
			drawing.target = { paneRole: 'unknown-role', yAxisRole: 'primary' };
		}
		expectIssue(
			workspace,
			'DRAWABLE_SCENE_KIND_UNSUPPORTED',
			'/drawings/0/target/paneRole',
		);
	});

	it('does not dispatch raw Scenes to the Workspace API or vice versa', () => {
		expectIssue(minimalScene, 'DRAWABLE_WORKSPACE_SCHEMA_INVALID', '/binding');
		try {
			parseChartScene(chartMinimal);
			expect.fail('Expected parseChartScene to reject a Workspace document.');
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
		}
	});
});
