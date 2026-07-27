import type { Viewport } from '@baron1996/kline-scene-schema';
import type { Chart } from 'klinecharts';

/** 应用只属于初始场景的视口状态。 */
export function applyViewport(chart: Chart, viewport: Viewport): void {
	chart.setBarSpace(viewport.barSpace);
	chart.scrollToTimestamp(viewport.anchorTimestamp, 0);
	chart.setOffsetRightDistance(viewport.rightOffsetDistance);
}
