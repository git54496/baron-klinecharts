import type {
	ChartScene,
	SceneOverlay,
} from '@baron1996/kline-scene-schema';
import { SceneError } from '@baron1996/kline-scene-schema';
import type {
	DeepPartial,
	Overlay,
	OverlayCreate,
	OverlayStyle,
	Point,
} from 'klinecharts';

import type { EngineIdMap } from './id-map.js';
import { requireMappedId } from './id-map.js';
import { normalizePriceValue } from './price.js';
import { isSupportedOverlay } from '../registry/overlays.js';

type ScenePoint = { timestamp: number; value: number };

export interface OverlaySourceSnapshot {
	readonly id: string;
	readonly type: SceneOverlay['type'];
	readonly paneId: string;
	readonly groupId?: string;
	readonly visible: boolean;
	readonly locked: boolean;
	readonly zLevel: number;
	readonly mode: SceneOverlay['mode'];
	readonly styles: SceneOverlay['styles'];
	readonly metadata?: SceneOverlay['metadata'];
}

export interface OverlayDrawingSource extends OverlaySourceSnapshot {
	readonly text?: string;
}

export interface EngineOverlayCallbacks {
	readonly onDrawEnd?: NonNullable<OverlayCreate['onDrawEnd']>;
	readonly onPressedMoveStart?: NonNullable<OverlayCreate['onPressedMoveStart']>;
	readonly onPressedMoving?: NonNullable<OverlayCreate['onPressedMoving']>;
	readonly onPressedMoveEnd?: NonNullable<OverlayCreate['onPressedMoveEnd']>;
	readonly onRemoved?: NonNullable<OverlayCreate['onRemoved']>;
	readonly onSelected?: NonNullable<OverlayCreate['onSelected']>;
	readonly onDeselected?: NonNullable<OverlayCreate['onDeselected']>;
}

function toLineStyle(style: SceneOverlay['styles']['line']) {
	return {
		color: style.color,
		size: style.size,
		style: style.style === 'solid' ? 'solid' as const : 'dashed' as const,
		dashedValue: style.style === 'dotted' ? [1, 2] : [4, 4],
		smooth: false,
	};
}

export function toOverlayStyles(styles: SceneOverlay['styles']): DeepPartial<OverlayStyle> {
	const borderStyle = styles.line.style === 'solid' ? 'solid' as const : 'dashed' as const;
	const borderDashedValue = styles.line.style === 'dotted' ? [1, 2] : [4, 4];
	return {
		line: toLineStyle(styles.line),
		rect: {
			style: 'stroke_fill',
			color: styles.fill.color,
			borderColor: styles.line.color,
			borderSize: styles.line.size,
			borderStyle,
			borderDashedValue,
		},
		polygon: {
			style: 'stroke_fill',
			color: styles.fill.color,
			borderColor: styles.line.color,
			borderSize: styles.line.size,
			borderStyle,
			borderDashedValue,
		},
		text: {
			style: 'stroke_fill',
			color: styles.text.color,
			size: styles.text.size,
			family: styles.text.family,
			weight: styles.text.weight,
			backgroundColor: styles.text.backgroundColor,
			borderColor: styles.text.borderColor,
			borderSize: styles.line.size,
			borderStyle,
			borderDashedValue,
		},
	};
}

function toPoints(overlay: SceneOverlay): Array<Partial<Point>> {
	switch (overlay.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag':
			return [{ value: (overlay.anchor as { value: number }).value }];
		case 'verticalStraightLine':
			return [{ timestamp: (overlay.anchor as { timestamp: number }).timestamp }];
		case 'horizontalRayLine':
		case 'horizontalSegment':
			return [
				{ timestamp: overlay.startTimestamp!, value: overlay.value! },
				{ timestamp: overlay.endTimestamp!, value: overlay.value! },
			];
		case 'verticalRayLine':
		case 'verticalSegment':
			return [
				{ timestamp: overlay.timestamp!, value: overlay.startValue! },
				{ timestamp: overlay.timestamp!, value: overlay.endValue! },
			];
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			return structuredClone(overlay.points ?? []);
		case 'simpleAnnotation':
		case 'crossLine':
		case 'callout':
		case 'text':
			return [structuredClone(overlay.point ?? {})];
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			return [structuredClone(overlay.start ?? {}), structuredClone(overlay.end ?? {})];
	}
}

function overlayText(overlay: SceneOverlay): string | undefined {
	switch (overlay.type) {
		case 'simpleAnnotation':
		case 'simpleTag':
		case 'callout':
		case 'text':
			return overlay.text;
		default:
			return undefined;
	}
}

export function toEngineOverlay(
	overlay: SceneOverlay,
	idMap: EngineIdMap,
	path: string,
	callbacks: EngineOverlayCallbacks = {},
): OverlayCreate {
	if (!isSupportedOverlay(overlay.type)) {
		throw new SceneError('UNKNOWN_OVERLAY', `${path}/type`, `Unsupported Overlay: ${overlay.type}`);
	}
	const value: OverlayCreate = {
		id: overlay.id,
		name: overlay.type,
		paneId: requireMappedId(idMap.paneToEngine, overlay.paneId, `${path}/paneId`, 'Pane'),
		lock: overlay.locked,
		visible: overlay.visible,
		zLevel: overlay.zLevel,
		mode: overlay.mode,
		points: toPoints(overlay),
		styles: toOverlayStyles(overlay.styles),
		...callbacks,
	};
	if (overlay.groupId !== undefined) {
		value.groupId = overlay.groupId;
	}
	const text = overlayText(overlay);
	if (text !== undefined) {
		value.extendData = text;
	}
	return value;
}

/** 创建尚无几何点的交互式 Overlay，不把临时状态写入 Scene。 */
export function toEngineOverlayDrawing(
	source: OverlayDrawingSource,
	idMap: EngineIdMap,
	callbacks: EngineOverlayCallbacks,
): OverlayCreate {
	if (!isSupportedOverlay(source.type)) {
		throw new SceneError('UNKNOWN_OVERLAY', '/overlays/type', `Unsupported Overlay: ${source.type}`);
	}
	const value: OverlayCreate = {
		id: source.id,
		name: source.type,
		paneId: requireMappedId(idMap.paneToEngine, source.paneId, '/overlays/paneId', 'Pane'),
		lock: source.locked,
		visible: source.visible,
		zLevel: source.zLevel,
		mode: source.mode,
		styles: toOverlayStyles(source.styles),
		...callbacks,
	};
	if (source.groupId !== undefined) {
		value.groupId = source.groupId;
	}
	if (source.text !== undefined) {
		value.extendData = source.text;
	}
	return value;
}

function requirePoint(
	points: Array<Partial<Point>>,
	index: number,
	requireTimestamp: boolean,
	requireValue: boolean,
	path: string,
	pricePrecision: number,
): ScenePoint {
	const point = points[index];
	if (
		point === undefined ||
		(requireTimestamp && !Number.isSafeInteger(point.timestamp)) ||
		(requireValue && !Number.isFinite(point.value))
	) {
		throw new SceneError('EXPORT_INVALID', path, 'KLineCharts returned an incomplete Overlay point.');
	}
	return {
		timestamp: point.timestamp ?? 0,
		value: requireValue
			? normalizePriceValue(point.value!, pricePrecision, `${path}/value`)
			: 0,
	};
}

function requireText(overlay: Overlay, path: string): string {
	if (typeof overlay.extendData !== 'string') {
		throw new SceneError('EXPORT_INVALID', path, 'KLineCharts returned an Overlay without text.');
	}
	return overlay.extendData;
}

function baseFromEngine(
	engine: Overlay,
	source: OverlaySourceSnapshot,
	idMap: EngineIdMap,
	path: string,
): SceneOverlay {
	const scenePaneId = idMap.paneFromEngine.get(engine.paneId);
	if (scenePaneId === undefined) {
		throw new SceneError('EXPORT_INVALID', `${path}/paneId`, 'Overlay uses an unmapped engine Pane.');
	}
	if (!isSupportedOverlay(engine.name) || engine.name !== source.type) {
		throw new SceneError('EXPORT_INVALID', `${path}/type`, 'Overlay type changed outside the registry.');
	}
	const base: SceneOverlay = {
		id: engine.id,
		type: engine.name,
		paneId: scenePaneId,
		visible: source.visible,
		locked: source.locked,
		zLevel: source.zLevel,
		mode: source.mode,
		styles: structuredClone(source.styles),
	};
	if (source.groupId !== undefined) {
		base.groupId = source.groupId;
	}
	if (source.metadata !== undefined) {
		base.metadata = structuredClone(source.metadata);
	}
	return base;
}

export function fromEngineOverlay(
	engine: Overlay,
	source: OverlaySourceSnapshot,
	idMap: EngineIdMap,
	path: string,
	pricePrecision: number,
): SceneOverlay {
	const base = baseFromEngine(engine, source, idMap, path);
	const points = engine.points;
	const readPoint = (
		index: number,
		requireTimestamp: boolean,
		requireValue: boolean,
		pointPath: string,
	): ScenePoint => requirePoint(
		points,
		index,
		requireTimestamp,
		requireValue,
		pointPath,
		pricePrecision,
	);
	switch (base.type) {
		case 'horizontalStraightLine':
		case 'priceLine': {
			const point = readPoint(0, false, true, `${path}/anchor`);
			return { ...base, anchor: { value: point.value } };
		}
		case 'verticalStraightLine': {
			const point = readPoint(0, true, false, `${path}/anchor`);
			return { ...base, anchor: { timestamp: point.timestamp } };
		}
		case 'horizontalRayLine':
		case 'horizontalSegment': {
			const start = readPoint(0, true, true, `${path}/points/0`);
			const end = readPoint(1, true, true, `${path}/points/1`);
			return {
				...base,
				value: start.value,
				startTimestamp: start.timestamp,
				endTimestamp: end.timestamp,
			};
		}
		case 'verticalRayLine':
		case 'verticalSegment': {
			const start = readPoint(0, true, true, `${path}/points/0`);
			const end = readPoint(1, true, true, `${path}/points/1`);
			return {
				...base,
				timestamp: start.timestamp,
				startValue: start.value,
				endValue: end.value,
			};
		}
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine': {
			return {
				...base,
				points: [
					readPoint(0, true, true, `${path}/points/0`),
					readPoint(1, true, true, `${path}/points/1`),
				],
			};
		}
		case 'priceChannelLine':
		case 'parallelStraightLine': {
			return {
				...base,
				points: [
					readPoint(0, true, true, `${path}/points/0`),
					readPoint(1, true, true, `${path}/points/1`),
					readPoint(2, true, true, `${path}/points/2`),
				],
			};
		}
		case 'brush': {
			const converted = points.map((_point, index) =>
				readPoint(index, true, true, `${path}/points/${index}`),
			);
			const first = converted[0];
			if (first === undefined) {
				throw new SceneError('EXPORT_INVALID', `${path}/points`, 'Brush has no points.');
			}
			return {
				...base,
				points: [first, ...converted.slice(1)],
			};
		}
		case 'simpleTag': {
			const point = readPoint(0, false, true, `${path}/anchor`);
			return {
				...base,
				anchor: { value: point.value },
				text: requireText(engine, `${path}/text`),
			};
		}
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			return {
				...base,
				point: readPoint(0, true, true, `${path}/point`),
				text: requireText(engine, `${path}/text`),
			};
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			return {
				...base,
				start: readPoint(0, true, true, `${path}/start`),
				end: readPoint(1, true, true, `${path}/end`),
			};
		case 'crossLine':
			return {
				...base,
				point: readPoint(0, true, true, `${path}/point`),
			};
	}
}

/** 在引擎内创建场景的全部标注。 */
export function createSceneOverlays(
	scene: ChartScene,
	chart: { createOverlay(value: OverlayCreate): string | null | Array<string | null> },
	idMap: EngineIdMap,
	callbacks?: (overlay: SceneOverlay) => EngineOverlayCallbacks,
): void {
	for (let index = 0; index < scene.overlays.length; index++) {
		const overlay = scene.overlays[index];
		if (overlay === undefined) {
			continue;
		}
		const result = chart.createOverlay(
			toEngineOverlay(overlay, idMap, `/overlays/${index}`, callbacks?.(overlay)),
		);
		if (result !== overlay.id) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/overlays/${index}`,
				`KLineCharts failed to create Overlay ${overlay.id}.`,
			);
		}
	}
}
