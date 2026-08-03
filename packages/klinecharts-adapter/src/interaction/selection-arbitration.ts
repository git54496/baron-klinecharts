import {
	hitTestOverlayGeometries,
	type OverlayPixelGeometry,
	type PixelCoordinate,
} from './hit-testing.js';

/**
 * 仅忽略引擎旧命中区域产生的取消选择：回调坐标必须仍命中当前选中 Overlay 的规范几何。
 */
export function shouldIgnoreStaleOverlayDeselection(
	selectedOverlayId: string | null,
	deselectedOverlayId: string,
	coordinate: PixelCoordinate | undefined,
	currentGeometries: readonly OverlayPixelGeometry[],
): boolean {
	if (selectedOverlayId !== deselectedOverlayId || coordinate === undefined) {
		return false;
	}
	return hitTestOverlayGeometries(coordinate, currentGeometries)?.overlayId === deselectedOverlayId;
}
