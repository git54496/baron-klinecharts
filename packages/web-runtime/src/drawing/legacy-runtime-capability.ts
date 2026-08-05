import type {
	Period,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import type { EngineDrawingSnapshot } from '@baron1996/klinecharts-adapter';

/**
 * Legacy SceneOverlay → 公共 Drawing 快照的只读视图。
 * 不构造 DrawingDocument，不改动 Legacy 状态与事件。
 */
export function overlayToDrawingSnapshot(
	overlay: SceneOverlay,
	period: Period,
): EngineDrawingSnapshot {
	const granularity = structuredClone(period);
	const geometry = overlayGeometry(overlay, granularity);
	return {
		id: overlay.id,
		type: overlay.type,
		target: { paneRole: 'candle', yAxisRole: 'primary' },
		geometry,
		styles: structuredClone(overlay.styles),
		locked: overlay.locked,
		visible: overlay.visible,
		zLevel: overlay.zLevel,
		mode: overlay.mode,
	};
}

function overlayGeometry(
	overlay: SceneOverlay,
	granularity: Period,
): EngineDrawingSnapshot['geometry'] {
	const result: Record<string, unknown> = {};
	switch (overlay.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
			result.value = (overlay.anchor as { value: number }).value;
			break;
		case 'simpleTag':
			result.value = (overlay.anchor as { value: number }).value;
			result.text = overlay.text ?? '';
			break;
		case 'verticalStraightLine':
			result.time = (overlay.anchor as { timestamp: number }).timestamp;
			break;
		case 'horizontalRayLine':
		case 'horizontalSegment':
			result.value = overlay.value!;
			result.startTime = overlay.startTimestamp!;
			result.endTime = overlay.endTimestamp!;
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			result.time = overlay.timestamp!;
			result.startValue = overlay.startValue!;
			result.endValue = overlay.endValue!;
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			result.points = overlay.points!.map((point) => ({
				timestamp: point.timestamp!,
				value: point.value!,
				granularity: structuredClone(granularity),
			}));
			break;
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			result.point = {
				timestamp: overlay.point!.timestamp!,
				value: overlay.point!.value!,
				granularity: structuredClone(granularity),
			};
			result.text = overlay.text ?? '';
			break;
		case 'crossLine':
			result.point = {
				timestamp: overlay.point!.timestamp!,
				value: overlay.point!.value!,
				granularity: structuredClone(granularity),
			};
			break;
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			result.start = {
				timestamp: overlay.start!.timestamp!,
				value: overlay.start!.value!,
				granularity: structuredClone(granularity),
			};
			result.end = {
				timestamp: overlay.end!.timestamp!,
				value: overlay.end!.value!,
				granularity: structuredClone(granularity),
			};
			break;
	}
	return result as unknown as EngineDrawingSnapshot['geometry'];
}
