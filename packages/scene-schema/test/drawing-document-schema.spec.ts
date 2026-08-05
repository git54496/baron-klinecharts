import { describe, expect, it } from 'vitest';

import allDrawings from '../../../tests/fixtures/drawings/all-drawings.json';
import invalidBrushPoints from '../../../tests/fixtures/drawings/invalid-brush-points.json';
import invalidDuplicateId from '../../../tests/fixtures/drawings/invalid-duplicate-id.json';
import invalidExtraField from '../../../tests/fixtures/drawings/invalid-extra-field.json';
import invalidNonPrimaryTarget from '../../../tests/fixtures/drawings/invalid-non-primary-target.json';
import invalidTargetMissing from '../../../tests/fixtures/drawings/invalid-target-missing.json';
import invalidUnknownType from '../../../tests/fixtures/drawings/invalid-unknown-type.json';
import invalidUnNormalizedValue from '../../../tests/fixtures/drawings/invalid-un-normalized-value.json';
import invalidValueAxesOrder from '../../../tests/fixtures/drawings/invalid-value-axes-order.json';
import {
	DrawingDocumentError,
	parseDrawingDocument,
} from '../src/index.js';

function expectIssue(value: unknown, code: string, path: string): void {
	try {
		parseDrawingDocument(value);
		expect.fail('Expected DrawingDocument validation to fail.');
	} catch (error) {
		expect(error).toBeInstanceOf(DrawingDocumentError);
		const drawingError = error as DrawingDocumentError;
		expect(drawingError.code).toBe(code);
		expect(drawingError.path).toBe(path);
	}
}

describe('DrawingDocument schema and semantics', () => {
	it('accepts and clones the 22-type fixture', () => {
		const parsed = parseDrawingDocument(allDrawings);
		expect(parsed).toEqual(allDrawings);
		expect(parsed).not.toBe(allDrawings);
		expect(parsed.drawings).toHaveLength(22);
	});

	it('rejects unknown top-level and drawing fields', () => {
		expectIssue(invalidExtraField, 'DRAWING_DOCUMENT_SCHEMA_INVALID', '/drawings/0/extra');
	});

	it('rejects unknown drawing types', () => {
		expectIssue(invalidUnknownType, 'DRAWING_DOCUMENT_SCHEMA_INVALID', '/drawings/0/type');
	});

	it('rejects duplicate drawing ids', () => {
		expectIssue(invalidDuplicateId, 'DRAWING_DUPLICATE_ID', '/drawings/1/id');
	});

	it('rejects brush with fewer than two points', () => {
		expectIssue(invalidBrushPoints, 'DRAWING_DOCUMENT_SCHEMA_INVALID', '/drawings/14');
	});

	it('rejects un-normalized values', () => {
		expectIssue(
			invalidUnNormalizedValue,
			'DRAWING_GEOMETRY_INVALID',
			'/drawings/0/geometry/value',
		);
	});

	it('rejects targets that miss every value axis', () => {
		expectIssue(
			invalidTargetMissing,
			'DRAWING_TARGET_INVALID',
			'/drawings/0/target',
		);
	});

	it('rejects non-primary y-axis targets', () => {
		expectIssue(
			invalidNonPrimaryTarget,
			'DRAWING_TARGET_INVALID',
			'/coordinateSystem/valueAxes/1/yAxisRole',
		);
	});

	it('rejects unsorted or duplicate value axes', () => {
		expectIssue(
			invalidValueAxesOrder,
			'DRAWING_DOCUMENT_SEMANTIC_INVALID',
			'/coordinateSystem/valueAxes/1',
		);
	});
});
