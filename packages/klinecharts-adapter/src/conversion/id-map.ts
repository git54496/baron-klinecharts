import type { ChartScene } from '@baron1996/kline-scene-schema';
import { SceneError } from '@baron1996/kline-scene-schema';
import type { Chart, YAxis } from 'klinecharts';

interface IdentifiedYAxis extends YAxis {
	readonly id: string;
	readonly paneId: string;
}

export interface EngineIdMap {
	readonly paneToEngine: ReadonlyMap<string, string>;
	readonly paneFromEngine: ReadonlyMap<string, string>;
	readonly yAxisToEngine: ReadonlyMap<string, string>;
	readonly yAxisFromEngine: ReadonlyMap<string, string>;
}

function invert(source: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
	return new Map(Array.from(source, ([sceneId, engineId]) => [engineId, sceneId]));
}

/** 依据场景数组位置建立稳定且双向的内部 ID 映射。 */
export function createEngineIdMap(scene: ChartScene, chart: Chart): EngineIdMap {
	const paneToEngine = new Map<string, string>();
	const yAxisToEngine = new Map<string, string>();
	for (let paneIndex = 0; paneIndex < scene.panes.length; paneIndex++) {
		const pane = scene.panes[paneIndex];
		if (pane === undefined) {
			continue;
		}
		const enginePaneId = pane.kind === 'candle' ? 'candle_pane' : `baron_pane_${paneIndex}`;
		paneToEngine.set(pane.id, enginePaneId);
		for (let axisIndex = 0; axisIndex < pane.yAxes.length; axisIndex++) {
			const axis = pane.yAxes[axisIndex];
			if (axis === undefined) {
				continue;
			}
			if (pane.kind === 'candle' && axis.role === 'primary') {
				const actual = chart.getYAxes({ paneId: enginePaneId }) as IdentifiedYAxis[];
				const defaultAxis = actual[0];
				if (defaultAxis === undefined) {
					throw new SceneError(
						'RUNTIME_INIT_FAILED',
						`/panes/${paneIndex}/yAxes/${axisIndex}`,
						'KLineCharts did not create the candle Pane primary Y-axis.',
					);
				}
				yAxisToEngine.set(axis.id, defaultAxis.id);
			} else {
				yAxisToEngine.set(axis.id, `baron_y_${paneIndex}_${axisIndex}`);
			}
		}
	}
	return {
		paneToEngine,
		paneFromEngine: invert(paneToEngine),
		yAxisToEngine,
		yAxisFromEngine: invert(yAxisToEngine),
	};
}

export function requireMappedId(
	map: ReadonlyMap<string, string>,
	sceneId: string,
	path: string,
	label: string,
): string {
	const engineId = map.get(sceneId);
	if (engineId === undefined) {
		throw new SceneError('INVALID_REFERENCE', path, `${label} ${sceneId} is not mapped.`);
	}
	return engineId;
}
