import { hashCanonicalScene, serializeCanonicalScene } from '@baron1996/kline-scene-schema';

import { readSceneFile } from '../files.js';

export async function inspectCommand(inputPath: string): Promise<Record<string, unknown>> {
	const scene = await readSceneFile(inputPath);
	return {
		schema: scene.schema,
		version: scene.version,
		runtime: scene.runtime,
		symbol: scene.symbol,
		period: scene.period,
		dataPoints: scene.data.length,
		panes: scene.panes.length,
		indicators: scene.panes.reduce((count, pane) => count + pane.indicators.length, 0),
		overlays: scene.overlays.length,
		canonicalBytes: serializeCanonicalScene(scene).byteLength,
		sha256: await hashCanonicalScene(scene),
	};
}
