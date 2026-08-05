import { describe, expect, it } from 'vitest';

import allDrawings from '../../../tests/fixtures/drawings/all-drawings.json';
import type { Period } from '../src/generated/chart-scene.js';
import type { Drawing, DrawingPeriod as DrawingPeriodAlias } from '../src/generated/drawing-document.js';
import type { TimeSeriesPeriod } from '../src/generated/time-series-scene.js';
import type { SceneOverlay } from '../src/generated/chart-scene.js';
import {
	DrawableWorkspaceSchema,
	DrawingDocumentSchema,
} from '../src/generated/schemas.js';

type OverlayWithoutDrawing = Exclude<SceneOverlay['type'], Drawing['type']>;
type DrawingWithoutOverlay = Exclude<Drawing['type'], SceneOverlay['type']>;

const _overlayExhaustive: OverlayWithoutDrawing extends never ? true : never = true;
const _drawingExhaustive: DrawingWithoutOverlay extends never ? true : never = true;
void _overlayExhaustive;
void _drawingExhaustive;

type PeriodShape = {
	readonly span: number;
	readonly type: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
};
type SamePeriodShape = [Period, TimeSeriesPeriod, DrawingPeriodAlias] extends [
	infer First,
	infer Second,
	infer Third,
]
	? First extends PeriodShape
		? Second extends PeriodShape
			? Third extends PeriodShape
				? PeriodShape extends First
					? PeriodShape extends Second
						? PeriodShape extends Third
							? true
							: never
						: never
					: never
				: never
			: never
		: never
	: never;

const _samePeriodShape: SamePeriodShape = true;
void _samePeriodShape;

describe('Drawing generation', () => {
	it('freezes 22 unique Drawing types with bidirectional exhaustiveness', () => {
		const types = new Set(allDrawings.drawings.map((drawing) => drawing.type));
		expect(types).toHaveLength(22);
		const drawingTypes = new Set<string>([
			'horizontalRayLine',
			'horizontalSegment',
			'horizontalStraightLine',
			'verticalRayLine',
			'verticalSegment',
			'verticalStraightLine',
			'rayLine',
			'segment',
			'straightLine',
			'priceLine',
			'priceChannelLine',
			'parallelStraightLine',
			'fibonacciLine',
			'brush',
			'simpleAnnotation',
			'simpleTag',
			'priceMeasurement',
			'rectangle',
			'arrow',
			'crossLine',
			'callout',
			'text',
		]);
		expect(types).toEqual(drawingTypes);
	});

	it('exports both new Schema constants', () => {
		expect(
			(DrawingDocumentSchema.properties as { schema: { const: string } }).schema.const,
		).toBe('@baron1996/drawing-document');
		expect(
			(DrawableWorkspaceSchema.properties as { schema: { const: string } }).schema.const,
		).toBe('@baron1996/drawable-workspace');
	});
});
