export const OVERLAY_BODY_HIT_THRESHOLD_CSS_PX = 12;
export const OVERLAY_ANCHOR_HIT_THRESHOLD_CSS_PX = 14;
export const OVERLAY_TOUCH_BODY_HIT_THRESHOLD_CSS_PX = 22;
export const OVERLAY_TOUCH_ANCHOR_HIT_THRESHOLD_CSS_PX = 24;

export interface OverlayHitTolerance {
	readonly body: number;
	readonly anchor: number;
}

export const DEFAULT_OVERLAY_MOUSE_HIT_TOLERANCE: OverlayHitTolerance = {
	body: OVERLAY_BODY_HIT_THRESHOLD_CSS_PX,
	anchor: OVERLAY_ANCHOR_HIT_THRESHOLD_CSS_PX,
};

export const DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE: OverlayHitTolerance = {
	body: OVERLAY_TOUCH_BODY_HIT_THRESHOLD_CSS_PX,
	anchor: OVERLAY_TOUCH_ANCHOR_HIT_THRESHOLD_CSS_PX,
};

export interface PixelCoordinate {
	readonly x: number;
	readonly y: number;
}

export interface PixelRectangle {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

export interface OverlayPixelGeometry {
	readonly overlayId: string;
	readonly sceneIndex: number;
	readonly zLevel: number;
	readonly locked: boolean;
	readonly anchors: readonly PixelCoordinate[];
	readonly bodySegments: readonly (readonly [PixelCoordinate, PixelCoordinate])[];
	readonly bodyRectangles?: readonly PixelRectangle[];
}

export interface OverlayHitResult {
	readonly overlayId: string;
	readonly target: 'anchor' | 'body';
	readonly anchorIndex: number | null;
	readonly locked: boolean;
}

interface RankedHit extends OverlayHitResult {
	readonly distance: number;
	readonly sceneIndex: number;
	readonly zLevel: number;
}

function coordinateDistance(left: PixelCoordinate, right: PixelCoordinate): number {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

function segmentDistance(
	point: PixelCoordinate,
	start: PixelCoordinate,
	end: PixelCoordinate,
): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) {
		return coordinateDistance(point, start);
	}
	const projection = Math.max(
		0,
		Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
	);
	return coordinateDistance(point, {
		x: start.x + projection * dx,
		y: start.y + projection * dy,
	});
}

function rectangleDistance(point: PixelCoordinate, rectangle: PixelRectangle): number {
	const horizontal = Math.max(rectangle.left - point.x, 0, point.x - rectangle.right);
	const vertical = Math.max(rectangle.top - point.y, 0, point.y - rectangle.bottom);
	return Math.hypot(horizontal, vertical);
}

function compareHits(left: RankedHit, right: RankedHit): number {
	if (left.distance !== right.distance) {
		return left.distance - right.distance;
	}
	if (left.zLevel !== right.zLevel) {
		return right.zLevel - left.zLevel;
	}
	if (left.sceneIndex !== right.sceneIndex) {
		return right.sceneIndex - left.sceneIndex;
	}
	if (
		left.overlayId === right.overlayId &&
		left.anchorIndex !== null &&
		right.anchorIndex !== null &&
		left.anchorIndex !== right.anchorIndex
	) {
		return left.anchorIndex - right.anchorIndex;
	}
	return 0;
}

/**
 * 按冻结契约在 CSS 像素坐标中执行命中测试。
 * 锚点全局优先于主体；同类再按 zLevel、Scene 后序和锚点低索引排序。
 */
export function hitTestOverlayGeometries(
	point: PixelCoordinate,
	geometries: readonly OverlayPixelGeometry[],
	tolerance: OverlayHitTolerance = DEFAULT_OVERLAY_MOUSE_HIT_TOLERANCE,
): OverlayHitResult | null {
	const anchorHits: RankedHit[] = [];
	const bodyHits: RankedHit[] = [];
	for (const geometry of geometries) {
		for (let anchorIndex = 0; anchorIndex < geometry.anchors.length; anchorIndex++) {
			const anchor = geometry.anchors[anchorIndex];
			if (anchor === undefined) {
				continue;
			}
			const distance = coordinateDistance(point, anchor);
			if (distance <= tolerance.anchor) {
				anchorHits.push({
					overlayId: geometry.overlayId,
					target: 'anchor',
					anchorIndex,
					locked: geometry.locked,
					distance,
					sceneIndex: geometry.sceneIndex,
					zLevel: geometry.zLevel,
				});
			}
		}
		let distance = Number.POSITIVE_INFINITY;
		for (const [start, end] of geometry.bodySegments) {
			distance = Math.min(distance, segmentDistance(point, start, end));
		}
		for (const rectangle of geometry.bodyRectangles ?? []) {
			distance = Math.min(distance, rectangleDistance(point, rectangle));
		}
		if (distance <= tolerance.body) {
			bodyHits.push({
				overlayId: geometry.overlayId,
				target: 'body',
				anchorIndex: null,
				locked: geometry.locked,
				distance,
				sceneIndex: geometry.sceneIndex,
				zLevel: geometry.zLevel,
			});
		}
	}
	const winner = (anchorHits.length > 0 ? anchorHits : bodyHits).sort(compareHits)[0];
	if (winner === undefined) {
		return null;
	}
	return {
		overlayId: winner.overlayId,
		target: winner.target,
		anchorIndex: winner.anchorIndex,
		locked: winner.locked,
	};
}
