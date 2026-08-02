import type { ChartScene, YAxis as SceneYAxis } from '@baron1996/kline-scene-schema';
import { SceneError } from '@baron1996/kline-scene-schema';
import type { Chart, YAxis } from 'klinecharts';

import type { EngineIdMap } from './id-map.js';
import { requireMappedId } from './id-map.js';
import { createPaneIndicators } from './indicators.js';

interface IdentifiedYAxis extends YAxis {
	readonly id: string;
	readonly paneId: string;
}

function axisOverride(
	axis: SceneYAxis,
	enginePaneId: string,
	engineAxisId: string,
) {
	return {
		id: engineAxisId,
		paneId: enginePaneId,
		name: axis.scale === 'logarithmic' ? 'logarithm' : 'normal',
		reverse: axis.reverse,
		inside: axis.inside,
		position: axis.position,
		scrollZoomEnabled: axis.scrollZoomEnabled,
		gap: {
			top: axis.topGap,
			bottom: axis.bottomGap,
		},
		needWidget: true,
	};
}

/** 原子提交 Scene 前，将单条轴映射到引擎的正式 normal/logarithm 名称。 */
export function overrideSceneYAxis(
	chart: Chart,
	idMap: EngineIdMap,
	axis: SceneYAxis,
	paneId: string,
	path: string,
): void {
	const enginePaneId = requireMappedId(idMap.paneToEngine, paneId, `${path}/paneId`, 'Pane');
	const engineAxisId = requireMappedId(idMap.yAxisToEngine, axis.id, `${path}/id`, 'Y-axis');
	chart.overrideYAxis(axisOverride(axis, enginePaneId, engineAxisId));
}

/** 按 Scene 顺序创建 Pane、Y 轴和指标，并核对每个映射。 */
export function applyPanes(scene: ChartScene, chart: Chart, idMap: EngineIdMap): void {
	for (let paneIndex = 0; paneIndex < scene.panes.length; paneIndex++) {
		const pane = scene.panes[paneIndex];
		if (pane === undefined) {
			continue;
		}
		const enginePaneId = requireMappedId(
			idMap.paneToEngine,
			pane.id,
			`/panes/${paneIndex}/id`,
			'Pane',
		);
		if (pane.kind === 'indicator') {
			createPaneIndicators(chart, pane, paneIndex, idMap);
		}
		chart.setPaneOptions({
			id: enginePaneId,
			height: pane.height,
			minHeight: pane.minHeight,
			order: pane.order,
			state: pane.state,
			dragEnabled: false,
		});
		for (let axisIndex = 0; axisIndex < pane.yAxes.length; axisIndex++) {
			const axis = pane.yAxes[axisIndex];
			if (axis === undefined) {
				continue;
			}
			const engineAxisId = requireMappedId(
				idMap.yAxisToEngine,
				axis.id,
				`/panes/${paneIndex}/yAxes/${axisIndex}/id`,
				'Y-axis',
			);
			const override = axisOverride(axis, enginePaneId, engineAxisId);
			const axes = chart.getYAxes({ paneId: enginePaneId }) as IdentifiedYAxis[];
			if (axes.some((candidate) => candidate.id === engineAxisId)) {
				chart.overrideYAxis(override);
			} else {
				const createdId = chart.createYAxis(override);
				if (createdId !== engineAxisId) {
					throw new SceneError(
						'RUNTIME_INIT_FAILED',
						`/panes/${paneIndex}/yAxes/${axisIndex}`,
						`KLineCharts failed to create Y-axis ${axis.id}.`,
					);
				}
			}
		}
		const paneOptions = chart.getPaneOptions(enginePaneId);
		if (paneOptions === null || Array.isArray(paneOptions)) {
			throw new SceneError(
				'RUNTIME_INIT_FAILED',
				`/panes/${paneIndex}`,
				`KLineCharts did not retain Pane ${pane.id}.`,
			);
		}
		const actualAxisIds = new Set(
			(chart.getYAxes({ paneId: enginePaneId }) as IdentifiedYAxis[]).map((axis) => axis.id),
		);
		for (const axis of pane.yAxes) {
			const mapped = idMap.yAxisToEngine.get(axis.id);
			if (mapped === undefined || !actualAxisIds.has(mapped)) {
				throw new SceneError(
					'RUNTIME_INIT_FAILED',
					`/panes/${paneIndex}/yAxes`,
					`KLineCharts did not retain Y-axis ${axis.id}.`,
				);
			}
		}
	}
}
