import {
	DrawableWorkspaceError,
	DrawingDocumentError,
	SceneError,
} from '@baron1996/kline-scene-schema';

export type CliErrorCode =
	| 'CLI_ARGUMENT_INVALID'
	| 'INPUT_READ_FAILED'
	| 'OUTPUT_EXISTS'
	| 'INPUT_OUTPUT_CONFLICT'
	| 'COLLECTION_ITEM_NOT_FOUND'
	| 'COLLECTION_ITEM_EXISTS'
	| 'BROWSER_INSTALL_FAILED';

export class CliError extends Error {
	public constructor(
		public readonly code: CliErrorCode,
		public readonly path: string,
		message: string,
	) {
		super(message);
		this.name = 'CliError';
	}
}

export interface SerializedCliError {
	readonly code: string;
	readonly path: string;
	readonly message: string;
	readonly issues: readonly {
		readonly code: string;
		readonly path: string;
		readonly message: string;
	}[];
}

export function serializeCliError(error: unknown): SerializedCliError {
	if (error instanceof SceneError) {
		return {
			code: error.code,
			path: error.path,
			message: error.message,
			issues: error.issues,
		};
	}
	if (
		error instanceof DrawableWorkspaceError ||
		error instanceof DrawingDocumentError
	) {
		return {
			code: error.code,
			path: error.path,
			message: error.message,
			issues: error.issues,
		};
	}
	if (error instanceof CliError) {
		return {
			code: error.code,
			path: error.path,
			message: error.message,
			issues: [{ code: error.code, path: error.path, message: error.message }],
		};
	}
	const message = error instanceof Error ? error.message : String(error);
	return {
		code: 'INTERNAL_ERROR',
		path: '/',
		message,
		issues: [{ code: 'INTERNAL_ERROR', path: '/', message }],
	};
}
