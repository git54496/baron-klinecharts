export type TimeSeriesSceneErrorCode =
	| 'TIME_SERIES_SCENE_SCHEMA_INVALID'
	| 'TIME_SERIES_SCENE_VERSION_UNSUPPORTED'
	| 'TIME_SERIES_ENGINE_VERSION_MISMATCH'
	| 'TIME_SERIES_DATA_INVALID'
	| 'TIME_SERIES_UNKNOWN_SERIES'
	| 'TIME_SERIES_RUNTIME_DESTROYED'
	| 'TIME_SERIES_ADAPTER_FAILED'
	| 'TIME_SERIES_EXPORT_INVALID'
	| 'TIME_SERIES_BROWSER_NOT_INSTALLED'
	| 'TIME_SERIES_RENDER_FAILED'
	| 'TIME_SERIES_RENDER_TIMEOUT';

export interface TimeSeriesSceneIssue {
	readonly code: TimeSeriesSceneErrorCode;
	readonly path: string;
	readonly message: string;
}

export class TimeSeriesSceneError extends Error {
	public readonly code: TimeSeriesSceneErrorCode;
	public readonly path: string;
	public readonly issues: readonly TimeSeriesSceneIssue[];

	public constructor(
		code: TimeSeriesSceneErrorCode,
		path: string,
		message: string,
		issues?: readonly TimeSeriesSceneIssue[],
	) {
		super(message);
		this.name = 'TimeSeriesSceneError';
		this.code = code;
		this.path = path;
		this.issues = issues ?? [{ code, path, message }];
	}
}
