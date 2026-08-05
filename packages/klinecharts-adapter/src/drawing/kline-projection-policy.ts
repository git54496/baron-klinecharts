import type { ChartScene, Drawing, ValueAxis } from '@baron1996/kline-scene-schema';

import {
	DrawingProjectionError,
	type DrawingProjectionPolicy,
	type ProjectionScene,
	type ResolveAxisBindingInput,
	type ResolvedAxisBinding,
} from './projection-policy.js';

function candlePrimaryScale(scene: ChartScene): 'linear' | 'logarithmic' {
	const pane = scene.panes.find((candidate) => candidate.kind === 'candle');
	return pane?.yAxes.find((axis) => axis.role === 'primary')?.scale ?? 'linear';
}

function requirePrimaryAxis(
	scene: ChartScene,
	paneId: string,
	path: string,
): string {
	const pane = scene.panes.find((candidate) => candidate.id === paneId);
	const primary = pane?.yAxes.find((axis) => axis.role === 'primary');
	if (primary === undefined) {
		throw new DrawingProjectionError(
			'DRAWING_TARGET_INVALID',
			`${path}/target`,
			'KLine indicator target must bind the primary axis of its owning Pane.',
		);
	}
	return primary.id;
}

/** K 线场景薄绑定策略；只解析 candle/indicator 与 primary 轴。 */
export class KLineDrawingProjectionPolicy implements DrawingProjectionPolicy {
	public resolveAxisBinding(input: ResolveAxisBindingInput): ResolvedAxisBinding {
		const { scene, drawing, valueAxes, path } = input;
		if (scene.kind !== 'chart') {
			throw new DrawingProjectionError(
				'DRAWING_PROJECTION_INVALID',
				path,
				'KLineDrawingProjectionPolicy requires a chart Scene.',
			);
		}
		const target = drawing.target;
		if (target.yAxisRole !== 'primary') {
			throw new DrawingProjectionError(
				'DRAWING_TARGET_INVALID',
				`${path}/target/yAxisRole`,
				'v1 Drawing targets only allow the primary y-axis role.',
			);
		}
		if (target.paneRole === 'candle') {
			const axis = valueAxes.find(
				(candidate) =>
					candidate.paneRole === 'candle' &&
					candidate.yAxisRole === 'primary',
			);
			if (
				axis === undefined ||
				axis.valuePrecision !== scene.document.symbol.pricePrecision
			) {
				throw new DrawingProjectionError(
					'DRAWING_TARGET_INVALID',
					`${path}/target`,
					'Candle target precision must equal symbol.pricePrecision.',
				);
			}
			return {
				paneRole: 'candle',
				yAxisRole: 'primary',
				valuePrecision: axis.valuePrecision,
				scale: candlePrimaryScale(scene.document),
			};
		}
		if (target.paneRole.startsWith('indicator:')) {
			const indicatorId = target.paneRole.slice('indicator:'.length);
			const matches = scene.document.panes
				.flatMap((pane) => pane.indicators)
				.filter((indicator) => indicator.id === indicatorId);
			if (matches.length !== 1) {
				throw new DrawingProjectionError(
					'DRAWING_TARGET_INVALID',
					`${path}/target`,
					`Indicator target must resolve to exactly one SceneIndicator: ${indicatorId}.`,
				);
			}
			const indicator = matches[0]!;
			const primaryAxisId = requirePrimaryAxis(
				scene.document,
				indicator.paneId,
				path,
			);
			if (indicator.yAxisId !== primaryAxisId) {
				throw new DrawingProjectionError(
					'DRAWING_TARGET_INVALID',
					`${path}/target`,
					'Indicator target must bind the primary axis of its owning Pane.',
				);
			}
			const axis = valueAxes.find(
				(candidate) =>
					candidate.paneRole === target.paneRole &&
					candidate.yAxisRole === 'primary',
			);
			if (axis === undefined || axis.valuePrecision !== indicator.precision) {
				throw new DrawingProjectionError(
					'DRAWING_TARGET_INVALID',
					`${path}/target`,
					'Indicator target precision must equal the indicator precision.',
				);
			}
			const pane = scene.document.panes.find(
				(candidate) => candidate.id === indicator.paneId,
			);
			const scale =
				pane?.yAxes.find((candidate) => candidate.role === 'primary')?.scale
				?? 'linear';
			return {
				paneRole: target.paneRole,
				yAxisRole: 'primary',
				valuePrecision: axis.valuePrecision,
				scale,
			};
		}
		throw new DrawingProjectionError(
			'DRAWING_TARGET_INVALID',
			`${path}/target/paneRole`,
			`KLine Scene cannot interpret pane role: ${target.paneRole}.`,
		);
	}
}

export type { ChartScene, Drawing, ValueAxis };
