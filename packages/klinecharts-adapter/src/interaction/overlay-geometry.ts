import type { SceneOverlay, TimeValueAnchor } from '@baron1996/kline-scene-schema';

import type {
	OverlayPixelGeometry,
	PixelCoordinate,
	PixelRectangle,
} from './hit-testing.js';

export interface OverlayGeometryProjectionContext {
	readonly bounds: PixelRectangle;
	readonly referenceTimestamp: number;
	readonly referenceValue: number;
	readonly project: (point: TimeValueAnchor) => PixelCoordinate;
	readonly measureText: (text: string, overlay: SceneOverlay) => {
		readonly width: number;
		readonly height: number;
	};
}

type Segment = readonly [PixelCoordinate, PixelCoordinate];

function horizontal(bounds: PixelRectangle, y: number): Segment {
	return [{ x: bounds.left, y }, { x: bounds.right, y }];
}

function vertical(bounds: PixelRectangle, x: number): Segment {
	return [{ x, y: bounds.top }, { x, y: bounds.bottom }];
}

function clippedLine(
	origin: PixelCoordinate,
	toward: PixelCoordinate,
	bounds: PixelRectangle,
	minimum: number,
	maximum: number,
): Segment | null {
	const dx = toward.x - origin.x;
	const dy = toward.y - origin.y;
	if (dx === 0 && dy === 0) {
		return [origin, toward];
	}
	let from = minimum;
	let to = maximum;
	const clipDimension = (
		coordinate: number,
		delta: number,
		lower: number,
		upper: number,
	): boolean => {
		if (delta === 0) {
			return coordinate >= lower && coordinate <= upper;
		}
		const first = (lower - coordinate) / delta;
		const second = (upper - coordinate) / delta;
		from = Math.max(from, Math.min(first, second));
		to = Math.min(to, Math.max(first, second));
		return from <= to;
	};
	if (
		!clipDimension(origin.x, dx, bounds.left, bounds.right) ||
		!clipDimension(origin.y, dy, bounds.top, bounds.bottom)
	) {
		return null;
	}
	return [
		{ x: origin.x + dx * from, y: origin.y + dy * from },
		{ x: origin.x + dx * to, y: origin.y + dy * to },
	];
}

function infiniteLine(
	start: PixelCoordinate,
	end: PixelCoordinate,
	bounds: PixelRectangle,
): Segment | null {
	return clippedLine(start, end, bounds, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
}

function ray(
	start: PixelCoordinate,
	toward: PixelCoordinate,
	bounds: PixelRectangle,
): Segment | null {
	return clippedLine(start, toward, bounds, 0, Number.POSITIVE_INFINITY);
}

function textRectangle(
	anchor: PixelCoordinate,
	text: string,
	overlay: SceneOverlay,
	context: OverlayGeometryProjectionContext,
	align: 'left' | 'center',
	baseline: 'middle' | 'bottom',
): PixelRectangle {
	const measured = context.measureText(text, overlay);
	const left = align === 'center' ? anchor.x - measured.width / 2 : anchor.x;
	const top = baseline === 'middle' ? anchor.y - measured.height / 2 : anchor.y - measured.height;
	return {
		left,
		top,
		right: left + measured.width,
		bottom: top + measured.height,
	};
}

function projectPoints(
	overlay: SceneOverlay,
	context: OverlayGeometryProjectionContext,
): PixelCoordinate[] {
	return (overlay.points ?? []).map((point) => context.project(point));
}

function sequentialSegments(points: readonly PixelCoordinate[]): Segment[] {
	const segments: Segment[] = [];
	for (let index = 1; index < points.length; index++) {
		segments.push([points[index - 1]!, points[index]!]);
	}
	return segments;
}

function parallelLines(
	points: readonly PixelCoordinate[],
	bounds: PixelRectangle,
	includeMirror: boolean,
): Segment[] {
	if (points.length < 2) return [];
	const segments: Segment[] = [];
	const base = infiniteLine(points[0]!, points[1]!, bounds);
	if (base !== null) segments.push(base);
	if (points.length < 3) return segments;
	const parallelToward = {
		x: points[2]!.x + points[1]!.x - points[0]!.x,
		y: points[2]!.y + points[1]!.y - points[0]!.y,
	};
	const parallel = infiniteLine(points[2]!, parallelToward, bounds);
	if (parallel !== null) segments.push(parallel);
	if (includeMirror) {
		const mirroredOrigin = {
			x: points[0]!.x * 2 - points[2]!.x,
			y: points[0]!.y * 2 - points[2]!.y,
		};
		const mirroredToward = {
			x: mirroredOrigin.x + points[1]!.x - points[0]!.x,
			y: mirroredOrigin.y + points[1]!.y - points[0]!.y,
		};
		const mirrored = infiniteLine(mirroredOrigin, mirroredToward, bounds);
		if (mirrored !== null) segments.push(mirrored);
	}
	return segments;
}

function geometry(
	overlay: SceneOverlay,
	sceneIndex: number,
	anchors: readonly PixelCoordinate[],
	bodySegments: readonly Segment[],
	bodyRectangles: readonly PixelRectangle[] = [],
): OverlayPixelGeometry {
	return {
		overlayId: overlay.id,
		sceneIndex,
		zLevel: overlay.zLevel,
		locked: overlay.locked,
		anchors,
		bodySegments,
		bodyRectangles,
	};
}

/** 将 Drawing 业务几何投影成与画面一致的 CSS 像素命中几何。 */
export function projectOverlayGeometry(
	overlay: SceneOverlay,
	sceneIndex: number,
	context: OverlayGeometryProjectionContext,
): OverlayPixelGeometry | null {
	const { bounds, referenceTimestamp, referenceValue } = context;
	switch (overlay.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag': {
			const anchor = overlay.anchor;
			if (anchor === undefined || !('value' in anchor)) return null;
			const point = context.project({ timestamp: referenceTimestamp, value: anchor.value });
			return geometry(overlay, sceneIndex, [point], [horizontal(bounds, point.y)]);
		}
		case 'verticalStraightLine': {
			const anchor = overlay.anchor;
			if (anchor === undefined || !('timestamp' in anchor)) return null;
			const point = context.project({ timestamp: anchor.timestamp, value: referenceValue });
			return geometry(overlay, sceneIndex, [point], [vertical(bounds, point.x)]);
		}
		case 'horizontalRayLine':
		case 'horizontalSegment': {
			if (
				overlay.value === undefined || overlay.startTimestamp === undefined ||
				overlay.endTimestamp === undefined
			) return null;
			const start = context.project({ timestamp: overlay.startTimestamp, value: overlay.value });
			const end = context.project({ timestamp: overlay.endTimestamp, value: overlay.value });
			const body = overlay.type === 'horizontalRayLine' ? ray(start, end, bounds) : [start, end] as const;
			return geometry(overlay, sceneIndex, [start, end], body === null ? [] : [body]);
		}
		case 'verticalRayLine':
		case 'verticalSegment': {
			if (
				overlay.timestamp === undefined || overlay.startValue === undefined ||
				overlay.endValue === undefined
			) return null;
			const start = context.project({ timestamp: overlay.timestamp, value: overlay.startValue });
			const end = context.project({ timestamp: overlay.timestamp, value: overlay.endValue });
			const body = overlay.type === 'verticalRayLine' ? ray(start, end, bounds) : [start, end] as const;
			return geometry(overlay, sceneIndex, [start, end], body === null ? [] : [body]);
		}
		case 'segment': {
			const points = projectPoints(overlay, context);
			return points.length < 2 ? null : geometry(overlay, sceneIndex, points, sequentialSegments(points));
		}
		case 'brush': {
			const points = projectPoints(overlay, context);
			return points.length < 2 ? null : geometry(overlay, sceneIndex, [], sequentialSegments(points));
		}
		case 'rayLine':
		case 'straightLine': {
			const points = projectPoints(overlay, context);
			if (points.length < 2) return null;
			const body = overlay.type === 'rayLine'
				? ray(points[0]!, points[1]!, bounds)
				: infiniteLine(points[0]!, points[1]!, bounds);
			return geometry(overlay, sceneIndex, points, body === null ? [] : [body]);
		}
		case 'fibonacciLine': {
			const points = projectPoints(overlay, context);
			if (points.length < 2) return null;
			const body = [1, 0.786, 0.618, 0.5, 0.382, 0.236, 0].map((percent) => {
				const y = points[1]!.y + (points[0]!.y - points[1]!.y) * percent;
				return horizontal(bounds, y);
			});
			return geometry(overlay, sceneIndex, points, body);
		}
		case 'parallelStraightLine':
		case 'priceChannelLine': {
			const points = projectPoints(overlay, context);
			if (points.length < 2) return null;
			return geometry(
				overlay,
				sceneIndex,
				points,
				parallelLines(points, bounds, overlay.type === 'priceChannelLine'),
			);
		}
		case 'simpleAnnotation': {
			if (overlay.point === undefined) return null;
			const point = context.project(overlay.point);
			const lineStart = { x: point.x, y: point.y - 6 };
			const lineEnd = { x: point.x, y: point.y - 56 };
			const labelAnchor = { x: point.x, y: point.y - 61 };
			return geometry(
				overlay,
				sceneIndex,
				[point],
				[[lineStart, lineEnd]],
				[textRectangle(labelAnchor, overlay.text ?? '', overlay, context, 'center', 'bottom')],
			);
		}
		case 'callout': {
			if (overlay.point === undefined) return null;
			const point = context.project(overlay.point);
			const labelAnchor = { x: point.x + 16, y: point.y - 24 };
			return geometry(
				overlay,
				sceneIndex,
				[point],
				[[point, labelAnchor]],
				[textRectangle(labelAnchor, overlay.text ?? '', overlay, context, 'left', 'bottom')],
			);
		}
		case 'text': {
			if (overlay.point === undefined) return null;
			const point = context.project(overlay.point);
			return geometry(
				overlay,
				sceneIndex,
				[point],
				[],
				[textRectangle(point, overlay.text ?? '', overlay, context, 'left', 'middle')],
			);
		}
		case 'crossLine': {
			if (overlay.point === undefined) return null;
			const point = context.project(overlay.point);
			return geometry(overlay, sceneIndex, [point], [horizontal(bounds, point.y), vertical(bounds, point.x)]);
		}
		case 'rectangle':
		case 'priceMeasurement': {
			if (overlay.start === undefined || overlay.end === undefined) return null;
			const start = context.project(overlay.start);
			const end = context.project(overlay.end);
			const rectangle = {
				left: Math.min(start.x, end.x),
				top: Math.min(start.y, end.y),
				right: Math.max(start.x, end.x),
				bottom: Math.max(start.y, end.y),
			};
			return geometry(overlay, sceneIndex, [start, end], [], [rectangle]);
		}
		case 'arrow': {
			if (overlay.start === undefined || overlay.end === undefined) return null;
			const start = context.project(overlay.start);
			const end = context.project(overlay.end);
			return geometry(overlay, sceneIndex, [start, end], [[start, end]]);
		}
	}
}
