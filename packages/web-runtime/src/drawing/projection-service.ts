import { Temporal } from '@js-temporal/polyfill';
import type {
	Drawing,
	DrawingDocument,
	Period,
	ValueAxis,
} from '@baron1996/kline-scene-schema';
import { normalizeDecimalValue } from '@baron1996/kline-scene-schema';
import {
	DrawingProjectionError,
	KLineDrawingProjectionPolicy,
	TimeSeriesDrawingProjectionPolicy,
	type DrawingProjectionPolicy,
	type ProjectionScene,
	type ResolvedAxisBinding,
} from '@baron1996/klinecharts-adapter';

export type { ProjectionScene } from '@baron1996/klinecharts-adapter';

export interface DrawingTimeAnchor {
	readonly timestamp: number;
	readonly granularity: Period;
}

export type ProjectedBucketKind =
	| 'exact'
	| 'first-child'
	| 'containing-interval'
	| 'outside-data-range';

export interface ProjectedTimeBucket {
	readonly kind: ProjectedBucketKind;
	readonly startTimestamp: number;
	readonly endTimestamp: number;
	readonly dataIndex: number | null;
}

export interface ProjectedAnchor {
	readonly timestamp: number;
	readonly granularity: Period;
	readonly value: number | null;
	readonly bucket: ProjectedTimeBucket;
}

export interface ProjectedDrawing {
	readonly drawing: Drawing;
	readonly binding: ResolvedAxisBinding;
	readonly anchors: readonly ProjectedAnchor[];
	readonly visible: boolean;
}

export interface ProjectedDrawingDocument {
	readonly scopeKey: string;
	readonly timezone: string;
	readonly drawings: readonly ProjectedDrawing[];
}

export interface ProjectDrawingInput {
	readonly scene: ProjectionScene;
	readonly drawing: Drawing;
	readonly valueAxes: readonly ValueAxis[];
	readonly path: string;
}

export interface ReverseProjectAnchorInput {
	readonly original: DrawingTimeAnchor;
	readonly editingScenePeriod: Period;
	readonly targetTimestamp: number;
	readonly data: readonly { readonly timestamp: number }[];
	readonly scenePeriod: Period;
	readonly timezone: string;
}

export interface ReverseProjectDrawingInput {
	readonly scene: ProjectionScene;
	readonly drawing: Drawing;
	readonly valueAxes: readonly ValueAxis[];
	readonly path: string;
	readonly horizontal?: {
		readonly targetTimestamp: number;
		readonly editingScenePeriod: Period;
	};
	readonly vertical?: {
		readonly values: readonly number[];
	};
}

const EPOCH_DATE = Temporal.PlainDate.from('1970-01-01');

function zoned(timestamp: number, timezone: string): Temporal.ZonedDateTime {
	return Temporal.Instant.fromEpochMilliseconds(timestamp).toZonedDateTimeISO(
		timezone,
	);
}

/**
 * 纯时间桶、22 种几何与反投影核心；不持有 Adapter/引擎，输入输出深拷贝。
 */
export class DrawingProjectionService {
	readonly #klinePolicy = new KLineDrawingProjectionPolicy();
	readonly #timeSeriesPolicy = new TimeSeriesDrawingProjectionPolicy();

	public addPeriod(
		timestamp: number,
		period: Period,
		timezone: string,
	): number {
		const duration = durationLike(period);
		return zoned(timestamp, timezone).add(duration).epochMilliseconds;
	}

	#periodStart(
		timestamp: number,
		period: Period,
		timezone: string,
	): number {
		if (
			period.type === 'second' ||
			period.type === 'minute' ||
			period.type === 'hour'
		) {
			const unitMilliseconds =
				period.type === 'second'
					? 1000
					: period.type === 'minute'
						? 60_000
						: 3_600_000;
			const bucketSize = unitMilliseconds * period.span;
			return Math.floor(timestamp / bucketSize) * bucketSize;
		}
		const date = zoned(timestamp, timezone).toPlainDate();
		if (period.type === 'day') {
			const days = date.since(EPOCH_DATE, { largestUnit: 'day' }).days;
			const bucket = Math.floor(days / period.span);
			return dateStart(EPOCH_DATE.add({ days: bucket * period.span }), timezone);
		}
		if (period.type === 'week') {
			const days = date.since(EPOCH_DATE, { largestUnit: 'day' }).days;
			const bucket = Math.floor(days / (7 * period.span));
			return dateStart(
				EPOCH_DATE.add({ days: bucket * 7 * period.span }),
				timezone,
			);
		}
		if (period.type === 'month') {
			const months = date.since(EPOCH_DATE, { largestUnit: 'month' }).months;
			const bucket = Math.floor(months / period.span);
			return dateStart(
				EPOCH_DATE.add({ months: bucket * period.span }),
				timezone,
			);
		}
		const years = date.since(EPOCH_DATE, { largestUnit: 'year' }).years;
		const bucket = Math.floor(years / period.span);
		return dateStart(EPOCH_DATE.add({ years: bucket * period.span }), timezone);
	}

	#barRange(
		timestamp: number,
		data: readonly { readonly timestamp: number }[],
		scenePeriod: Period,
		timezone: string,
	): { readonly start: number; readonly end: number; readonly dataIndex: number } | null {
		for (let index = 0; index < data.length; index++) {
			const start = data[index]!.timestamp;
			const end =
				index + 1 < data.length
					? data[index + 1]!.timestamp
					: this.addPeriod(start, scenePeriod, timezone);
			if (timestamp >= start && timestamp < end) {
				return { start, end, dataIndex: index };
			}
		}
		return null;
	}

	#projectAnchor(
		anchor: DrawingTimeAnchor,
		data: readonly { readonly timestamp: number }[],
		scenePeriod: Period,
		timezone: string,
	): ProjectedTimeBucket {
		const bar = this.#barRange(anchor.timestamp, data, scenePeriod, timezone);
		const start = this.#periodStart(anchor.timestamp, anchor.granularity, timezone);
		const end = this.addPeriod(start, anchor.granularity, timezone);
		if (bar === null) {
			return {
				kind: 'outside-data-range',
				startTimestamp: start,
				endTimestamp: end,
				dataIndex: null,
			};
		}
		if (start === bar.start && end === bar.end) {
			return {
				kind: 'exact',
				startTimestamp: start,
				endTimestamp: end,
				dataIndex: bar.dataIndex,
			};
		}
		if (start >= bar.start && end <= bar.end) {
			return {
				kind: 'first-child',
				startTimestamp: start,
				endTimestamp: end,
				dataIndex: bar.dataIndex,
			};
		}
		if (start <= bar.start && end >= bar.end) {
			return {
				kind: 'containing-interval',
				startTimestamp: start,
				endTimestamp: end,
				dataIndex: bar.dataIndex,
			};
		}
		return {
			kind: 'outside-data-range',
			startTimestamp: start,
			endTimestamp: end,
			dataIndex: null,
		};
	}

	public projectDrawing(input: ProjectDrawingInput): ProjectedDrawing {
		const policy = this.#policyFor(input.scene);
		const binding = policy.resolveAxisBinding({
			scene: input.scene,
			drawing: input.drawing,
			valueAxes: input.valueAxes,
			path: input.path,
		});
		if (
			binding.scale === 'logarithmic' &&
			geometryValues(input.drawing).some((value) => value <= 0)
		) {
			throw new DrawingProjectionError(
				'VALUE_AXIS_SCALE_UNSUPPORTED',
				input.path,
				'Logarithmic value axes reject non-positive Drawing values.',
			);
		}
		const data =
			input.scene.kind === 'chart'
				? input.scene.document.data
				: input.scene.document.data;
		const scenePeriod =
			input.scene.kind === 'chart'
				? input.scene.document.period
				: input.scene.document.period;
		const timezone =
			input.scene.kind === 'chart'
				? input.scene.document.chart.timezone
				: input.scene.document.chart.timezone;
		const anchors = geometryAnchors(input.drawing, scenePeriod).map((entry) => ({
			timestamp: entry.anchor.timestamp,
			granularity: structuredClone(entry.anchor.granularity),
			value: entry.value,
			bucket: this.#projectAnchor(
				entry.anchor,
				data,
				scenePeriod,
				timezone,
			),
		}));
		const visible =
			anchors.length === 0 ||
			anchors.every((anchor) => anchor.bucket.kind !== 'outside-data-range');
		return {
			drawing: structuredClone(input.drawing),
			binding,
			anchors,
			visible,
		};
	}

	public projectDocument(input: {
		readonly scene: ProjectionScene;
		readonly drawings: DrawingDocument;
	}): ProjectedDrawingDocument {
		const drawings = input.drawings.drawings.map((drawing, index) =>
			this.projectDrawing({
				scene: input.scene,
				drawing,
				valueAxes: input.drawings.coordinateSystem.valueAxes,
				path: `/drawings/${index}`,
			}),
		);
		return {
			scopeKey: input.drawings.scopeKey,
			timezone: input.drawings.coordinateSystem.timezone,
			drawings,
		};
	}

	public reverseProjectAnchor(input: ReverseProjectAnchorInput): DrawingTimeAnchor {
		const { original, editingScenePeriod, targetTimestamp, data, scenePeriod, timezone } =
			input;
		const originalLength =
			this.addPeriod(original.timestamp, original.granularity, timezone) -
			original.timestamp;
		const editingLength =
			this.addPeriod(original.timestamp, editingScenePeriod, timezone) -
			original.timestamp;
		const bar = this.#barRange(targetTimestamp, data, scenePeriod, timezone);
		if (bar === null) {
			throw new DrawingProjectionError(
				'DRAWING_PROJECTION_INVALID',
				'/target',
				'Target timestamp does not map to a Scene bar interval.',
			);
		}
		if (editingLength < originalLength) {
			return {
				timestamp: bar.start,
				granularity: structuredClone(editingScenePeriod),
			};
		}
		if (editingLength === originalLength) {
			return {
				timestamp: bar.start,
				granularity: structuredClone(original.granularity),
			};
		}
		const oldStart = this.#periodStart(
			original.timestamp,
			original.granularity,
			timezone,
		);
		const newStart = this.#periodStart(
			targetTimestamp,
			original.granularity,
			timezone,
		);
		const oldEnd = this.addPeriod(oldStart, original.granularity, timezone);
		const newEnd = this.addPeriod(newStart, original.granularity, timezone);
		const duration = zoned(original.timestamp, timezone).since(
			zoned(oldStart, timezone),
			{
				largestUnit: original.granularity.type,
				smallestUnit: 'millisecond',
				roundingMode: 'trunc',
			},
		);
		let candidate = zoned(newStart, timezone).add(duration).epochMilliseconds;
		let iterations = 0;
		while (candidate < newStart || candidate >= newEnd) {
			if (iterations >= 100_000) {
				throw new DrawingProjectionError(
					'DRAWING_PROJECTION_INVALID',
					'/target',
					'Coarse-period reverse projection exceeded 100000 adjustments.',
				);
			}
			iterations += 1;
			if (candidate < newStart) {
				const next = this.addPeriod(
					candidate,
					original.granularity,
					timezone,
				);
				if (next >= newEnd) {
					throw new DrawingProjectionError(
						'DRAWING_PROJECTION_INVALID',
						'/target',
						'Coarse-period reverse projection crossed the far boundary.',
					);
				}
				candidate = next;
			} else {
				const next = zoned(candidate, timezone)
					.subtract(durationLike(original.granularity))
					.epochMilliseconds;
				if (next < newStart) {
					throw new DrawingProjectionError(
						'DRAWING_PROJECTION_INVALID',
						'/target',
						'Coarse-period reverse projection crossed the near boundary.',
					);
				}
				candidate = next;
			}
		}
		return {
			timestamp: candidate,
			granularity: structuredClone(original.granularity),
		};
	}

	public reverseProjectDrawing(
		input: ReverseProjectDrawingInput,
	): Drawing {
		const policy = this.#policyFor(input.scene);
		const binding = policy.resolveAxisBinding({
			scene: input.scene,
			drawing: input.drawing,
			valueAxes: input.valueAxes,
			path: input.path,
		});
		const data =
			input.scene.kind === 'chart'
				? input.scene.document.data
				: input.scene.document.data;
		const scenePeriod =
			input.scene.kind === 'chart'
				? input.scene.document.period
				: input.scene.document.period;
		const timezone =
			input.scene.kind === 'chart'
				? input.scene.document.chart.timezone
				: input.scene.document.chart.timezone;
		const candidate = structuredClone(input.drawing);
		const horizontal = input.horizontal;
		const vertical = input.vertical;
		if (horizontal !== undefined) {
			mapTimeAnchors(candidate, scenePeriod, (anchor) =>
				this.reverseProjectAnchor({
					original: anchor,
					editingScenePeriod: horizontal.editingScenePeriod,
					targetTimestamp: horizontal.targetTimestamp,
					data,
					scenePeriod,
					timezone,
				}),
			);
		}
		if (vertical !== undefined) {
			let valueIndex = 0;
			mapValueAnchors(candidate, (value) => {
				const replacement = vertical.values[valueIndex];
				valueIndex += 1;
				if (replacement === undefined) {
					throw new DrawingProjectionError(
						'DRAWING_PROJECTION_INVALID',
						input.path,
						'Vertical edit values must match the Drawing value anchor count.',
					);
				}
				return normalizeDecimalValue(replacement, binding.valuePrecision);
			});
			if (valueIndex !== vertical.values.length) {
				throw new DrawingProjectionError(
					'DRAWING_PROJECTION_INVALID',
					input.path,
					'Vertical edit values must match the Drawing value anchor count.',
				);
			}
		}
		return candidate;
	}

	#policyFor(scene: ProjectionScene): DrawingProjectionPolicy {
		return scene.kind === 'chart'
			? this.#klinePolicy
			: this.#timeSeriesPolicy;
	}
}

function durationLike(period: Period): Record<string, number> {
	switch (period.type) {
		case 'second':
			return { seconds: period.span };
		case 'minute':
			return { minutes: period.span };
		case 'hour':
			return { hours: period.span };
		case 'day':
			return { days: period.span };
		case 'week':
			return { weeks: period.span };
		case 'month':
			return { months: period.span };
		case 'year':
			return { years: period.span };
	}
}

function dateStart(date: Temporal.PlainDate, timezone: string): number {
	return date
		.toZonedDateTime({ timeZone: timezone, plainTime: '00:00' })
		.epochMilliseconds;
}

interface GeometryAnchorEntry {
	readonly anchor: DrawingTimeAnchor;
	readonly value: number | null;
}

export function geometryAnchors(
	drawing: Drawing,
	defaultGranularity: Period,
): readonly GeometryAnchorEntry[] {
	const result: GeometryAnchorEntry[] = [];
	const add = (
		anchor: DrawingTimeAnchor,
		value: number | null = null,
	): void => {
		result.push({ anchor, value });
	};
	switch (drawing.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag':
			break;
		case 'verticalStraightLine':
			add({
				timestamp: drawing.geometry.time,
				granularity: defaultGranularity,
			});
			break;
		case 'horizontalRayLine':
		case 'horizontalSegment':
			add(
				{
					timestamp: drawing.geometry.startTime,
					granularity: defaultGranularity,
				},
				drawing.geometry.value,
			);
			add(
				{
					timestamp: drawing.geometry.endTime,
					granularity: defaultGranularity,
				},
				drawing.geometry.value,
			);
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			add(
				{
					timestamp: drawing.geometry.time,
					granularity: defaultGranularity,
				},
				null,
			);
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			for (const point of drawing.geometry.points) {
				add(
					{ timestamp: point.timestamp, granularity: point.granularity },
					point.value,
				);
			}
			break;
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
		case 'crossLine':
			add(
				{
					timestamp: drawing.geometry.point.timestamp,
					granularity: drawing.geometry.point.granularity,
				},
				drawing.geometry.point.value,
			);
			break;
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			add(
				{
					timestamp: drawing.geometry.start.timestamp,
					granularity: drawing.geometry.start.granularity,
				},
				drawing.geometry.start.value,
			);
			add(
				{
					timestamp: drawing.geometry.end.timestamp,
					granularity: drawing.geometry.end.granularity,
				},
				drawing.geometry.end.value,
			);
			break;
	}
	return result;
}

function mapTimeAnchors(
	drawing: Drawing,
	defaultGranularity: Period,
	transform: (anchor: DrawingTimeAnchor) => DrawingTimeAnchor,
): void {
	switch (drawing.type) {
		case 'verticalStraightLine':
			drawing.geometry.time = transform({
				timestamp: drawing.geometry.time,
				granularity: defaultGranularity,
			}).timestamp;
			break;
		case 'horizontalRayLine':
		case 'horizontalSegment':
			drawing.geometry.startTime = transform({
				timestamp: drawing.geometry.startTime,
				granularity: defaultGranularity,
			}).timestamp;
			drawing.geometry.endTime = transform({
				timestamp: drawing.geometry.endTime,
				granularity: defaultGranularity,
			}).timestamp;
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			drawing.geometry.time = transform({
				timestamp: drawing.geometry.time,
				granularity: defaultGranularity,
			}).timestamp;
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			for (const point of drawing.geometry.points) {
				const updated = transform({
					timestamp: point.timestamp,
					granularity: point.granularity,
				});
				point.timestamp = updated.timestamp;
				point.granularity = updated.granularity;
			}
			break;
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
		case 'crossLine':
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement': {
			const point =
				'point' in drawing.geometry
					? drawing.geometry.point
					: undefined;
			if (point !== undefined) {
				const updated = transform({
					timestamp: point.timestamp,
					granularity: point.granularity,
				});
				point.timestamp = updated.timestamp;
				point.granularity = updated.granularity;
			}
			if ('start' in drawing.geometry) {
				const updated = transform({
					timestamp: drawing.geometry.start.timestamp,
					granularity: drawing.geometry.start.granularity,
				});
				drawing.geometry.start.timestamp = updated.timestamp;
				drawing.geometry.start.granularity = updated.granularity;
				const endUpdated = transform({
					timestamp: drawing.geometry.end.timestamp,
					granularity: drawing.geometry.end.granularity,
				});
				drawing.geometry.end.timestamp = endUpdated.timestamp;
				drawing.geometry.end.granularity = endUpdated.granularity;
			}
			break;
		}
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag':
			break;
	}
}

function mapValueAnchors(
	drawing: Drawing,
	transform: (value: number) => number,
): void {
	switch (drawing.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag':
			drawing.geometry.value = transform(drawing.geometry.value);
			break;
		case 'horizontalRayLine':
		case 'horizontalSegment':
			drawing.geometry.value = transform(drawing.geometry.value);
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			drawing.geometry.startValue = transform(drawing.geometry.startValue);
			drawing.geometry.endValue = transform(drawing.geometry.endValue);
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			for (const point of drawing.geometry.points) {
				point.value = transform(point.value);
			}
			break;
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
		case 'crossLine':
			drawing.geometry.point.value = transform(drawing.geometry.point.value);
			break;
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			drawing.geometry.start.value = transform(drawing.geometry.start.value);
			drawing.geometry.end.value = transform(drawing.geometry.end.value);
			break;
		case 'verticalStraightLine':
			break;
	}
}

function geometryValues(drawing: Drawing): readonly number[] {
	const values: number[] = [];
	switch (drawing.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag':
		case 'horizontalRayLine':
		case 'horizontalSegment':
			values.push(drawing.geometry.value);
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			values.push(drawing.geometry.startValue, drawing.geometry.endValue);
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			for (const point of drawing.geometry.points) {
				values.push(point.value);
			}
			break;
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
		case 'crossLine':
			values.push(drawing.geometry.point.value);
			break;
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			values.push(drawing.geometry.start.value, drawing.geometry.end.value);
			break;
		case 'verticalStraightLine':
			break;
	}
	return values;
}
