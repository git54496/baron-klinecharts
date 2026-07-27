import type { SceneOverlay } from '@baron1996/kline-scene-schema';

export const BUILT_IN_OVERLAYS = [
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
] as const satisfies readonly SceneOverlay['type'][];

export const PROJECT_OVERLAYS = [
	'rectangle',
	'arrow',
	'crossLine',
	'callout',
	'text',
] as const satisfies readonly SceneOverlay['type'][];

export const SUPPORTED_OVERLAYS = [
	...BUILT_IN_OVERLAYS,
	...PROJECT_OVERLAYS,
] as const satisfies readonly SceneOverlay['type'][];

const supported = new Set<SceneOverlay['type']>(SUPPORTED_OVERLAYS);

export function isSupportedOverlay(name: string): name is SceneOverlay['type'] {
	return supported.has(name as SceneOverlay['type']);
}
