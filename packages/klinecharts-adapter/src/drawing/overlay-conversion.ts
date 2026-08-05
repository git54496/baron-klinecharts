import type {
	Drawing,
	Period,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';

/**
 * Drawing 业务几何 ↔ 旧 SceneOverlay 兼容几何的纯数据映射。
 * 不写回 dataIndex、paneId、yAxisId 或任何引擎内部 ID。
 */

export function drawingToSceneOverlay(
	drawing: Drawing,
	paneId: string,
): SceneOverlay {
	const base = {
		id: drawing.id,
		type: drawing.type,
		paneId,
		visible: drawing.visible,
		locked: drawing.locked,
		zLevel: drawing.zLevel,
		mode: drawing.mode,
		styles: structuredClone(drawing.styles),
	};
	if (drawing.groupId !== undefined) {
		(base as { groupId?: string }).groupId = drawing.groupId;
	}
	if (drawing.metadata !== undefined) {
		(base as { metadata?: unknown }).metadata = structuredClone(drawing.metadata);
	}
	switch (drawing.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
			return { ...base, anchor: { value: drawing.geometry.value } };
		case 'simpleTag':
			return {
				...base,
				anchor: { value: drawing.geometry.value },
				text: drawing.geometry.text,
			};
		case 'verticalStraightLine':
			return { ...base, anchor: { timestamp: drawing.geometry.time } };
		case 'horizontalRayLine':
		case 'horizontalSegment':
			return {
				...base,
				value: drawing.geometry.value,
				startTimestamp: drawing.geometry.startTime,
				endTimestamp: drawing.geometry.endTime,
			};
		case 'verticalRayLine':
		case 'verticalSegment':
			return {
				...base,
				timestamp: drawing.geometry.time,
				startValue: drawing.geometry.startValue,
				endValue: drawing.geometry.endValue,
			};
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			return {
				...base,
				points: drawing.geometry.points.map((point) => ({
					timestamp: point.timestamp,
					value: point.value,
				})) as NonNullable<SceneOverlay['points']>,
			};
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			return {
				...base,
				point: {
					timestamp: drawing.geometry.point.timestamp,
					value: drawing.geometry.point.value,
				},
				text: drawing.geometry.text,
			};
		case 'crossLine':
			return {
				...base,
				point: {
					timestamp: drawing.geometry.point.timestamp,
					value: drawing.geometry.point.value,
				},
			};
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			return {
				...base,
				start: {
					timestamp: drawing.geometry.start.timestamp,
					value: drawing.geometry.start.value,
				},
				end: {
					timestamp: drawing.geometry.end.timestamp,
					value: drawing.geometry.end.value,
				},
			};
	}
}

function drawingText(drawing: Drawing): string | undefined {
	switch (drawing.type) {
		case 'simpleTag':
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			return drawing.geometry.text;
		default:
			return undefined;
	}
}

/** 用引擎归一化后的 SceneOverlay 几何重建 Drawing；granularity 从源 Drawing 恢复。 */
export function sceneOverlayToDrawing(
	overlay: SceneOverlay,
	source: Drawing,
): Drawing {
	const text = overlay.type === 'simpleTag'
		|| overlay.type === 'simpleAnnotation'
		|| overlay.type === 'callout'
		|| overlay.type === 'text'
		? overlay.text
		: drawingText(source);
	const result: Record<string, unknown> = {
		id: overlay.id,
		target: structuredClone(source.target),
		visible: overlay.visible,
		locked: overlay.locked,
		zLevel: overlay.zLevel,
		mode: overlay.mode,
		styles: structuredClone(overlay.styles),
		type: overlay.type,
	};
	if (overlay.groupId !== undefined) {
		result.groupId = overlay.groupId;
	}
	if (overlay.metadata !== undefined) {
		result.metadata = structuredClone(overlay.metadata);
	}
	switch (overlay.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
			result.geometry = { value: (overlay.anchor as { value: number }).value };
			break;
		case 'simpleTag':
			result.geometry = {
				value: (overlay.anchor as { value: number }).value,
				text: overlay.text ?? '',
			};
			break;
		case 'verticalStraightLine':
			result.geometry = {
				time: (overlay.anchor as { timestamp: number }).timestamp,
			};
			break;
		case 'horizontalRayLine':
		case 'horizontalSegment':
			result.geometry = {
				value: overlay.value!,
				startTime: overlay.startTimestamp!,
				endTime: overlay.endTimestamp!,
			};
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			result.geometry = {
				time: overlay.timestamp!,
				startValue: overlay.startValue!,
				endValue: overlay.endValue!,
			};
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			result.geometry = {
				points: overlay.points!.map((point, index) => ({
					timestamp: point.timestamp!,
					value: point.value!,
					granularity: structuredClone(pointGranularity(source, index)),
				})),
			};
			break;
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			result.geometry = {
				point: {
					timestamp: overlay.point!.timestamp!,
					value: overlay.point!.value!,
					granularity: structuredClone(pointGranularity(source, 0)),
				},
				text: overlay.text ?? '',
			};
			break;
		case 'crossLine':
			result.geometry = {
				point: {
					timestamp: overlay.point!.timestamp!,
					value: overlay.point!.value!,
					granularity: structuredClone(pointGranularity(source, 0)),
				},
			};
			break;
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			result.geometry = {
				start: {
					timestamp: overlay.start!.timestamp!,
					value: overlay.start!.value!,
					granularity: structuredClone(pointGranularity(source, 0)),
				},
				end: {
					timestamp: overlay.end!.timestamp!,
					value: overlay.end!.value!,
					granularity: structuredClone(pointGranularity(source, 1)),
				},
			};
			break;
	}
	return result as unknown as Drawing;
}

function pointGranularity(source: Drawing, index: number): Period {
	if (
		source.type === 'rayLine' ||
		source.type === 'segment' ||
		source.type === 'straightLine' ||
		source.type === 'fibonacciLine' ||
		source.type === 'priceChannelLine' ||
		source.type === 'parallelStraightLine' ||
		source.type === 'brush'
	) {
		const point = source.geometry.points[index] ?? source.geometry.points[0];
		return structuredClone(point?.granularity ?? { type: 'day', span: 1 });
	}
	if (
		source.type === 'simpleAnnotation' ||
		source.type === 'callout' ||
		source.type === 'text' ||
		source.type === 'crossLine'
	) {
		return structuredClone(source.geometry.point.granularity);
	}
	if (
		source.type === 'rectangle' ||
		source.type === 'arrow' ||
		source.type === 'priceMeasurement'
	) {
		const anchor = index === 0 ? source.geometry.start : source.geometry.end;
		return structuredClone(anchor.granularity);
	}
	return { type: 'day', span: 1 };
}
