export type SceneErrorCode =
	| 'SCENE_SCHEMA_INVALID'
	| 'SCENE_VERSION_UNSUPPORTED'
	| 'ENGINE_VERSION_MISMATCH'
	| 'INVALID_MARKET_DATA'
	| 'DUPLICATE_ID'
	| 'UNKNOWN_INDICATOR'
	| 'UNKNOWN_OVERLAY'
	| 'INVALID_REFERENCE'
	| 'RUNTIME_INIT_FAILED'
	| 'EXPORT_INVALID'
	| 'BROWSER_NOT_INSTALLED'
	| 'RENDER_TIMEOUT';

export interface SceneIssue {
	readonly code: SceneErrorCode;
	readonly path: string;
	readonly message: string;
}

export class SceneError extends Error {
	public readonly code: SceneErrorCode;
	public readonly path: string;
	public readonly issues: readonly SceneIssue[];

	public constructor(code: SceneErrorCode, path: string, message: string, issues?: readonly SceneIssue[]) {
		super(message);
		this.name = 'SceneError';
		this.code = code;
		this.path = path;
		this.issues = issues ?? [{ code, path, message }];
	}
}
