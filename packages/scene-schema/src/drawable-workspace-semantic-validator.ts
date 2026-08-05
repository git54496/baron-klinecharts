import type {
	ChartScene,
	DrawingDocument,
	DrawableWorkspaceDocument,
	SceneIndicator,
	TimeSeriesScene,
	ValueAxis,
} from './generated/drawable-workspace.js';
import {
	DrawableWorkspaceError,
	type DrawableWorkspaceErrorCode,
	type DrawableWorkspaceIssue,
} from './drawable-workspace-errors.js';

function issue(
	code: DrawableWorkspaceErrorCode,
	path: string,
	message: string,
): DrawableWorkspaceIssue {
	return { code, path, message };
}

function sameAxes(
	left: readonly ValueAxis[],
	right: readonly ValueAxis[],
): boolean {
	if (left.length !== right.length) {
		return false;
	}
	return left.every((axis, index) => {
		const other = right[index];
		return other !== undefined
			&& axis.paneRole === other.paneRole
			&& axis.yAxisRole === other.yAxisRole
			&& axis.valuePrecision === other.valuePrecision;
	});
}

function indicatorsOf(scene: ChartScene): readonly SceneIndicator[] {
	return scene.panes.flatMap((pane) => pane.indicators);
}

function validateChartBinding(
	scene: ChartScene,
	drawings: DrawingDocument,
	issues: DrawableWorkspaceIssue[],
): void {
	const indicators = indicatorsOf(scene);
	for (let index = 0; index < drawings.drawings.length; index++) {
		const drawing = drawings.drawings[index];
		if (drawing === undefined) {
			continue;
		}
		const path = `/drawings/${index}/target`;
		const target = drawing.target;
		if (target.yAxisRole !== 'primary') {
			issues.push(
				issue(
					'DRAWING_TARGET_INVALID',
					`${path}/yAxisRole`,
					'v1 Workspace drawings only bind the primary y-axis role.',
				),
			);
			continue;
		}
		if (target.paneRole === 'candle') {
			const expectedPrecision = scene.symbol.pricePrecision;
			const axis = drawings.coordinateSystem.valueAxes.find(
				(candidate) =>
					candidate.paneRole === 'candle' &&
					candidate.yAxisRole === 'primary',
			);
			if (axis === undefined || axis.valuePrecision !== expectedPrecision) {
				issues.push(
					issue(
						'DRAWING_TARGET_INVALID',
						path,
						'Candle target precision must equal symbol.pricePrecision.',
					),
				);
			}
			continue;
		}
		if (target.paneRole.startsWith('indicator:')) {
			const indicatorId = target.paneRole.slice('indicator:'.length);
			const matches = indicators.filter((indicator) => indicator.id === indicatorId);
			if (matches.length !== 1) {
				issues.push(
					issue(
						'DRAWING_TARGET_INVALID',
						path,
						`Indicator target must resolve to exactly one SceneIndicator: ${indicatorId}.`,
					),
				);
				continue;
			}
			const indicator = matches[0]!;
			const pane = scene.panes.find((candidate) => candidate.id === indicator.paneId);
			const primaryAxis = pane?.yAxes.find((axis) => axis.role === 'primary');
			if (primaryAxis === undefined || indicator.yAxisId !== primaryAxis.id) {
				issues.push(
					issue(
						'DRAWING_TARGET_INVALID',
						path,
						'Indicator target must bind the primary axis of its owning Pane.',
					),
				);
				continue;
			}
			const axis = drawings.coordinateSystem.valueAxes.find(
				(candidate) =>
					candidate.paneRole === target.paneRole &&
					candidate.yAxisRole === 'primary',
			);
			if (axis === undefined || axis.valuePrecision !== indicator.precision) {
				issues.push(
					issue(
						'DRAWING_TARGET_INVALID',
						path,
						'Indicator target precision must equal the indicator precision.',
					),
				);
			}
			continue;
		}
		issues.push(
			issue(
				'DRAWABLE_SCENE_KIND_UNSUPPORTED',
				`${path}/paneRole`,
				`Chart Scene cannot interpret pane role: ${target.paneRole}.`,
			),
		);
	}
}

function validateTimeSeriesBinding(
	scene: TimeSeriesScene,
	drawings: DrawingDocument,
	issues: DrawableWorkspaceIssue[],
): void {
	const sharedPrecision = scene.series[0]?.precision;
	const axis = drawings.coordinateSystem.valueAxes.find(
		(candidate) =>
			candidate.paneRole === 'time-series' &&
			candidate.yAxisRole === 'primary',
	);
	if (axis === undefined || axis.valuePrecision !== sharedPrecision) {
		issues.push(
			issue(
				'DRAWING_TARGET_INVALID',
				'/binding/valueAxes',
				'TimeSeries primary binding precision must equal the shared series precision.',
			),
		);
	}
	for (let index = 0; index < drawings.drawings.length; index++) {
		const drawing = drawings.drawings[index];
		if (drawing === undefined) {
			continue;
		}
		const target = drawing.target;
		if (
			target.paneRole !== 'time-series' ||
			target.yAxisRole !== 'primary'
		) {
			issues.push(
				issue(
					'DRAWING_TARGET_INVALID',
					`/drawings/${index}/target`,
					'TimeSeries drawings must target time-series / primary.',
				),
			);
		}
	}
}

export function collectWorkspaceSemanticIssues(
	workspace: DrawableWorkspaceDocument,
): readonly DrawableWorkspaceIssue[] {
	const issues: DrawableWorkspaceIssue[] = [];
	const binding = workspace.binding;
	const drawings = workspace.drawings;
	if (binding.scopeKey !== drawings.scopeKey) {
		issues.push(
			issue(
				'DRAWABLE_WORKSPACE_BINDING_MISMATCH',
				'/binding/scopeKey',
				'Workspace binding scopeKey must equal the DrawingDocument scopeKey.',
			),
		);
	}
	if (binding.timezone !== drawings.coordinateSystem.timezone) {
		issues.push(
			issue(
				'DRAWABLE_WORKSPACE_BINDING_MISMATCH',
				'/binding/timezone',
				'Workspace binding timezone must equal the DrawingDocument timezone.',
			),
		);
	}
	if (!sameAxes(binding.valueAxes, drawings.coordinateSystem.valueAxes)) {
		issues.push(
			issue(
				'DRAWABLE_WORKSPACE_BINDING_MISMATCH',
				'/binding/valueAxes',
				'Workspace binding valueAxes must exactly equal the DrawingDocument valueAxes.',
			),
		);
	}
	const scene = workspace.scene;
	if (scene.kind === 'chart') {
		const document = scene.document;
		if (document.chart.timezone !== binding.timezone) {
			issues.push(
				issue(
					'DRAWABLE_WORKSPACE_BINDING_MISMATCH',
					'/scene/document/chart/timezone',
					'Chart Scene timezone must equal the Workspace binding timezone.',
				),
			);
		}
		if (document.overlays.length > 0) {
			issues.push(
				issue(
					'DRAWABLE_WORKSPACE_DOUBLE_AUTHORITY',
					'/scene/document/overlays',
					'Workspace chart Scenes must not carry legacy overlays.',
				),
			);
		}
		validateChartBinding(document, drawings, issues);
	} else if (scene.kind === 'time-series') {
		const document = scene.document;
		if (document.chart.timezone !== binding.timezone) {
			issues.push(
				issue(
					'DRAWABLE_WORKSPACE_BINDING_MISMATCH',
					'/scene/document/chart/timezone',
					'TimeSeries Scene timezone must equal the Workspace binding timezone.',
				),
			);
		}
		validateTimeSeriesBinding(document, drawings, issues);
	} else {
		issues.push(
			issue(
				'DRAWABLE_SCENE_KIND_UNSUPPORTED',
				'/scene/kind',
				`Unsupported Workspace scene kind: ${String((scene as { kind?: unknown }).kind)}.`,
			),
		);
	}
	return issues;
}

export function assertSemanticDrawableWorkspace(
	workspace: DrawableWorkspaceDocument,
): void {
	const issues = collectWorkspaceSemanticIssues(workspace);
	const first = issues[0];
	if (first !== undefined) {
		throw new DrawableWorkspaceError(first.code, first.path, first.message, issues);
	}
}
