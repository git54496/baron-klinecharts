import type {
	ChartScene,
	Drawing,
	TimeSeriesScene,
	ValueAxis,
} from '@baron1996/kline-scene-schema';

export type DrawingProjectionErrorCode =
	| 'DRAWING_TARGET_INVALID'
	| 'DRAWING_PROJECTION_INVALID'
	| 'VALUE_AXIS_SCALE_UNSUPPORTED';

export class DrawingProjectionError extends Error {
	public readonly code: DrawingProjectionErrorCode;
	public readonly path: string;

	public constructor(code: DrawingProjectionErrorCode, path: string, message: string) {
		super(message);
		this.name = 'DrawingProjectionError';
		this.code = code;
		this.path = path;
	}
}

export type ProjectionScene =
	| {
			readonly kind: 'chart';
			readonly document: ChartScene;
	  }
	| {
			readonly kind: 'time-series';
			readonly document: TimeSeriesScene;
	  };

export interface ResolvedAxisBinding {
	readonly paneRole: string;
	readonly yAxisRole: 'primary';
	readonly valuePrecision: number;
	readonly scale: 'linear' | 'logarithmic';
}

export interface ResolveAxisBindingInput {
	readonly scene: ProjectionScene;
	readonly drawing: Drawing;
	readonly valueAxes: readonly ValueAxis[];
	readonly path: string;
}

/**
 * 纯 Drawing 轴绑定策略：只解析 paneRole/yAxisRole/valuePrecision/scale，
 * 不持有引擎、不实现时间/几何算法，不接收引擎实例或像素输入。
 */
export interface DrawingProjectionPolicy {
	resolveAxisBinding(input: ResolveAxisBindingInput): ResolvedAxisBinding;
}
