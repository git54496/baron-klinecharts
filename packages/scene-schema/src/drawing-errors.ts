export type DrawingDocumentErrorCode =
	| 'DRAWING_DOCUMENT_SCHEMA_INVALID'
	| 'DRAWING_DOCUMENT_SEMANTIC_INVALID'
	| 'DRAWING_DUPLICATE_ID'
	| 'DRAWING_GEOMETRY_INVALID'
	| 'DRAWING_TARGET_INVALID';

export interface DrawingDocumentIssue {
	readonly code: DrawingDocumentErrorCode;
	readonly path: string;
	readonly message: string;
}

export class DrawingDocumentError extends Error {
	public readonly code: DrawingDocumentErrorCode;
	public readonly path: string;
	public readonly issues: readonly DrawingDocumentIssue[];

	public constructor(
		code: DrawingDocumentErrorCode,
		path: string,
		message: string,
		issues?: readonly DrawingDocumentIssue[],
	) {
		super(message);
		this.name = 'DrawingDocumentError';
		this.code = code;
		this.path = path;
		this.issues = issues ?? [{ code, path, message }];
	}
}
