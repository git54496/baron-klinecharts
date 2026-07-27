import type { ChartScene, JsonValue } from './generated/chart-scene.js';

function sortJsonValue(value: JsonValue): JsonValue {
	if (Array.isArray(value)) {
		return value.map((item) => sortJsonValue(item));
	}
	if (value !== null && typeof value === 'object') {
		const sorted: Record<string, JsonValue> = {};
		for (const key of Object.keys(value).sort()) {
			const child = value[key];
			if (child !== undefined) {
				sorted[key] = sortJsonValue(child);
			}
		}
		return sorted;
	}
	return value;
}

export function canonicalizeScene(scene: ChartScene): ChartScene {
	return sortJsonValue(structuredClone(scene) as unknown as JsonValue) as unknown as ChartScene;
}
