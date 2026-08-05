import type { DrawingDocumentErrorCode } from './drawing-errors.js';

export type DrawableWorkspaceErrorCode =
	| 'DRAWABLE_WORKSPACE_SCHEMA_INVALID'
	| 'DRAWABLE_WORKSPACE_BINDING_MISMATCH'
	| 'DRAWABLE_WORKSPACE_DOUBLE_AUTHORITY'
	| 'DRAWABLE_SCENE_KIND_UNSUPPORTED'
	| DrawingDocumentErrorCode;

export interface DrawableWorkspaceIssue {
	readonly code: DrawableWorkspaceErrorCode;
	readonly path: string;
	readonly message: string;
}

export class DrawableWorkspaceError extends Error {
	public readonly code: DrawableWorkspaceErrorCode;
	public readonly path: string;
	public readonly issues: readonly DrawableWorkspaceIssue[];

	public constructor(
		code: DrawableWorkspaceErrorCode,
		path: string,
		message: string,
		issues?: readonly DrawableWorkspaceIssue[],
	) {
		super(message);
		this.name = 'DrawableWorkspaceError';
		this.code = code;
		this.path = path;
		this.issues = issues ?? [{ code, path, message }];
	}
}
