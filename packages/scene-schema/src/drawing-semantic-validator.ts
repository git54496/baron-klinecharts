import type { Drawing, DrawingDocument, ValueAxis } from './generated/drawing-document.js';
import { DrawingDocumentError, type DrawingDocumentErrorCode, type DrawingDocumentIssue } from './drawing-errors.js';
import { normalizeDecimalValue } from './decimal-normalization.js';

function issue(
	code: DrawingDocumentErrorCode,
	path: string,
	message: string,
): DrawingDocumentIssue {
	return { code, path, message };
}

interface GeometryValuePath {
	readonly path: string;
	readonly value: number;
}

function drawingGeometryValues(
	drawing: Drawing,
	path: string,
): readonly GeometryValuePath[] {
	const result: GeometryValuePath[] = [];
	const add = (value: number, valuePath: string): void => {
		result.push({ path: valuePath, value });
	};
	switch (drawing.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
			add(drawing.geometry.value, `${path}/geometry/value`);
			break;
		case 'simpleTag':
			add(drawing.geometry.value, `${path}/geometry/value`);
			break;
		case 'verticalStraightLine':
			break;
		case 'horizontalRayLine':
		case 'horizontalSegment':
			add(drawing.geometry.value, `${path}/geometry/value`);
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			add(drawing.geometry.startValue, `${path}/geometry/startValue`);
			add(drawing.geometry.endValue, `${path}/geometry/endValue`);
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			for (let index = 0; index < drawing.geometry.points.length; index++) {
				add(drawing.geometry.points[index]!.value, `${path}/geometry/points/${index}/value`);
			}
			break;
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
		case 'crossLine':
			add(drawing.geometry.point.value, `${path}/geometry/point/value`);
			break;
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			add(drawing.geometry.start.value, `${path}/geometry/start/value`);
			add(drawing.geometry.end.value, `${path}/geometry/end/value`);
			break;
	}
	return result;
}

function validateValueAxes(
	document: DrawingDocument,
	issues: DrawingDocumentIssue[],
): void {
	const axes = document.coordinateSystem.valueAxes;
	for (let index = 0; index < axes.length; index++) {
		const axis = axes[index];
		if (axis === undefined) {
			continue;
		}
		const path = `/coordinateSystem/valueAxes/${index}`;
		if (axis.yAxisRole !== 'primary') {
			issues.push(
				issue(
					'DRAWING_TARGET_INVALID',
					`${path}/yAxisRole`,
					'v1 Drawing value axes only allow the primary role.',
				),
			);
		}
		const previous = axes[index - 1];
		if (
			previous !== undefined &&
			(
				previous.paneRole > axis.paneRole ||
				(previous.paneRole === axis.paneRole && previous.yAxisRole >= axis.yAxisRole)
			)
		) {
			issues.push(
				issue(
					'DRAWING_DOCUMENT_SEMANTIC_INVALID',
					path,
					'valueAxes must be lexically ascending by paneRole and yAxisRole without duplicates.',
				),
			);
		}
	}
}

function validateDrawing(
	document: DrawingDocument,
	drawing: Drawing,
	index: number,
	issues: DrawingDocumentIssue[],
): void {
	const path = `/drawings/${index}`;
	const axis = document.coordinateSystem.valueAxes.find(
		(candidate) =>
			candidate.paneRole === drawing.target.paneRole &&
			candidate.yAxisRole === drawing.target.yAxisRole,
	);
	if (axis === undefined) {
		issues.push(
			issue(
				'DRAWING_TARGET_INVALID',
				`${path}/target`,
				'Drawing target must exactly match one coordinateSystem.valueAxes entry.',
			),
		);
		return;
	}
	if (drawing.target.yAxisRole !== 'primary') {
		issues.push(
			issue(
				'DRAWING_TARGET_INVALID',
				`${path}/target/yAxisRole`,
				'v1 Drawing targets only allow the primary y-axis role.',
			),
		);
	}
	for (const coordinate of drawingGeometryValues(drawing, path)) {
		let normalized: number;
		try {
			normalized = normalizeDecimalValue(coordinate.value, axis.valuePrecision);
		} catch (error) {
			issues.push(
				issue(
					'DRAWING_GEOMETRY_INVALID',
					coordinate.path,
					error instanceof Error ? error.message : 'Value normalization failed.',
				),
			);
			continue;
		}
		if (normalized !== coordinate.value || Object.is(coordinate.value, -0)) {
			issues.push(
				issue(
					'DRAWING_GEOMETRY_INVALID',
					coordinate.path,
					`Value must already be normalized to precision ${axis.valuePrecision}.`,
				),
			);
		}
	}
}

export function collectDrawingSemanticIssues(
	document: DrawingDocument,
): readonly DrawingDocumentIssue[] {
	const issues: DrawingDocumentIssue[] = [];
	validateValueAxes(document, issues);
	const ids = new Set<string>();
	for (let index = 0; index < document.drawings.length; index++) {
		const drawing = document.drawings[index];
		if (drawing === undefined) {
			continue;
		}
		if (ids.has(drawing.id)) {
			issues.push(
				issue(
					'DRAWING_DUPLICATE_ID',
					`/drawings/${index}/id`,
					`Duplicate drawing ID: ${drawing.id}.`,
				),
			);
		}
		ids.add(drawing.id);
		validateDrawing(document, drawing, index, issues);
	}
	return issues;
}

export function assertSemanticDrawingDocument(document: DrawingDocument): void {
	const issues = collectDrawingSemanticIssues(document);
	const first = issues[0];
	if (first !== undefined) {
		throw new DrawingDocumentError(first.code, first.path, first.message, issues);
	}
}

export type { ValueAxis };
