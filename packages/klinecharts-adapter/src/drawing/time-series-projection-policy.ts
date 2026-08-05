import {
	DrawingProjectionError,
	type DrawingProjectionPolicy,
	type ResolveAxisBindingInput,
	type ResolvedAxisBinding,
} from './projection-policy.js';

/** 时间序列场景薄绑定策略；只接受公共 time-series / primary 轴。 */
export class TimeSeriesDrawingProjectionPolicy implements DrawingProjectionPolicy {
	public resolveAxisBinding(input: ResolveAxisBindingInput): ResolvedAxisBinding {
		const { scene, drawing, valueAxes, path } = input;
		if (scene.kind !== 'time-series') {
			throw new DrawingProjectionError(
				'DRAWING_PROJECTION_INVALID',
				path,
				'TimeSeriesDrawingProjectionPolicy requires a time-series Scene.',
			);
		}
		const target = drawing.target;
		if (
			target.paneRole !== 'time-series' ||
			target.yAxisRole !== 'primary'
		) {
			throw new DrawingProjectionError(
				'DRAWING_TARGET_INVALID',
				`${path}/target`,
				'TimeSeries drawings must target time-series / primary.',
			);
		}
		const sharedPrecision = scene.document.series[0]?.precision;
		const axis = valueAxes.find(
			(candidate) =>
				candidate.paneRole === 'time-series' &&
				candidate.yAxisRole === 'primary',
		);
		if (
			axis === undefined ||
			axis.valuePrecision !== sharedPrecision
		) {
			throw new DrawingProjectionError(
				'DRAWING_TARGET_INVALID',
				`${path}/target`,
				'TimeSeries primary binding precision must equal the shared series precision.',
			);
		}
		return {
			paneRole: 'time-series',
			yAxisRole: 'primary',
			valuePrecision: axis.valuePrecision,
			scale: 'linear',
		};
	}
}
