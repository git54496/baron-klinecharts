/** Product-owned zoom stops, ordered from dense to wide. Units are CSS px at DPR 1. */
export const CANDLE_ZOOM_LEVELS = [
	[1, 1], [2, 1], [3, 1], [4, 2], [5, 2], [6, 2], [7, 3], [8, 3],
	[9, 4], [10, 4], [11, 4], [12, 4], [13, 5], [14, 5], [15, 6],
	[16, 6], [18, 7], [20, 8], [22, 9], [24, 10], [27, 11], [30, 12],
	[33, 13], [36, 14],
] as const;

export interface CandleGeometry {
	readonly level: number;
	readonly dpr: number;
	readonly bodyPixels: number;
	readonly gapPixels: number;
	readonly pitchPixels: number;
	readonly body: number;
	readonly gap: number;
	readonly pitch: number;
}

export function candleGeometry(level: number, devicePixelRatio = 1): CandleGeometry {
	const index = Math.max(0, Math.min(CANDLE_ZOOM_LEVELS.length - 1, Math.round(level)));
	const [width, gap] = CANDLE_ZOOM_LEVELS[index]!;
	const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
	// Resolve ONCE per level, not once per candle. The actual pitch is their sum.
	const bodyPixels = Math.max(1, Math.round(width * dpr));
	const gapPixels = Math.max(1, Math.round(gap * dpr));
	return {
		level: index, dpr, bodyPixels, gapPixels, pitchPixels: bodyPixels + gapPixels,
		body: bodyPixels / dpr, gap: gapPixels / dpr, pitch: (bodyPixels + gapPixels) / dpr,
	};
}

/** Legacy saved/API barSpace values snap to the nearest supported stop; ties go dense. */
export function nearestCandleLevel(pitch: number, dpr = 1): number {
	let best = 0;
	let distance = Infinity;
	for (let index = 0; index < CANDLE_ZOOM_LEVELS.length; index++) {
		const next = Math.abs(candleGeometry(index, dpr).pitch - pitch);
		if (next < distance) { best = index; distance = next; }
	}
	return best;
}

/** Snap a common body-left origin; integer pitch then preserves every physical gap. */
export function candleCoordinate(rawFirstCenter: number, dataIndex: number, geometry: CandleGeometry): number {
	const left = Math.round(rawFirstCenter * geometry.dpr - geometry.bodyPixels / 2);
	return (left + geometry.bodyPixels / 2 + dataIndex * geometry.pitchPixels) / geometry.dpr;
}
