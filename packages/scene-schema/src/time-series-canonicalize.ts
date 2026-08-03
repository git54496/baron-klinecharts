import type {
	TimeSeriesMetadataValue,
	TimeSeriesScene,
} from './generated/time-series-scene.js';

type TimeSeriesJsonValue =
	| TimeSeriesMetadataValue
	| TimeSeriesJsonValue[]
	| { [key: string]: TimeSeriesJsonValue | undefined };

function sortTimeSeriesJson(value: TimeSeriesJsonValue): TimeSeriesJsonValue {
	if (Array.isArray(value)) {
		return value.map((item) => sortTimeSeriesJson(item));
	}
	if (value !== null && typeof value === 'object') {
		const sorted: Record<string, TimeSeriesJsonValue> = {};
		for (const key of Object.keys(value).sort()) {
			const child = value[key];
			if (child !== undefined) {
				sorted[key] = sortTimeSeriesJson(child);
			}
		}
		return sorted;
	}
	return value;
}

export function canonicalizeTimeSeriesScene(
	scene: TimeSeriesScene,
): TimeSeriesScene {
	return sortTimeSeriesJson(
		structuredClone(scene) as unknown as TimeSeriesJsonValue,
	) as unknown as TimeSeriesScene;
}
