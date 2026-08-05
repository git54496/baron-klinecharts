import type {
	ChartScene as WorkspaceChartScene,
	DrawableWorkspaceDocument,
	DrawingDocument as WorkspaceDrawingDocument,
	TimeSeriesScene as WorkspaceTimeSeriesScene,
} from './generated/drawable-workspace.js';
import { validateDrawableWorkspace as generatedValidator } from './generated/validate-drawable-workspace.js';
import { canonicalizeDrawableWorkspace } from './drawable-workspace-canonicalize.js';
import {
	DrawableWorkspaceError,
	type DrawableWorkspaceErrorCode,
	type DrawableWorkspaceIssue,
} from './drawable-workspace-errors.js';
import { assertSemanticDrawableWorkspace } from './drawable-workspace-semantic-validator.js';
import { parseChartScene } from './validator.js';
import { parseTimeSeriesScene } from './time-series-validator.js';
import { parseDrawingDocument } from './drawing-validator.js';

interface StructuralError {
	readonly instancePath: string;
	readonly schemaPath: string;
	readonly keyword: string;
	readonly message?: string;
	readonly params?: {
		readonly additionalProperty?: string;
		readonly missingProperty?: string;
	};
}

interface StructuralValidator {
	(value: unknown): boolean;
	errors?: readonly StructuralError[] | null;
}

const validateStructural = generatedValidator as unknown as StructuralValidator;

function pointerToken(value: string): string {
	return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function structuralPath(error: StructuralError): string {
	if (
		error.keyword === 'additionalProperties' &&
		error.params?.additionalProperty !== undefined
	) {
		return `${error.instancePath}/${pointerToken(error.params.additionalProperty)}` || '/';
	}
	if (
		error.keyword === 'required' &&
		error.params?.missingProperty !== undefined
	) {
		return `${error.instancePath}/${pointerToken(error.params.missingProperty)}` || '/';
	}
	return error.instancePath || '/';
}

function structuralCode(_error: StructuralError): DrawableWorkspaceErrorCode {
	return 'DRAWABLE_WORKSPACE_SCHEMA_INVALID';
}

function isTopLevelStructuralError(
	error: StructuralError,
	all: readonly StructuralError[],
): boolean {
	if (error.keyword === 'oneOf') {
		return true;
	}
	const oneOfPaths = all
		.filter((candidate) => candidate.keyword === 'oneOf')
		.map((candidate) => candidate.instancePath);
	const descendant = oneOfPaths.some(
		(prefix) =>
			error.instancePath.length > prefix.length &&
			error.instancePath.startsWith(`${prefix}/`),
	);
	if (!descendant) {
		return true;
	}
	return error.schemaPath.startsWith('#/properties/type/');
}

export function parseStructuralDrawableWorkspace(
	value: unknown,
): DrawableWorkspaceDocument {
	if (!validateStructural(value)) {
		const all = validateStructural.errors ?? [];
		const errors = all
			.filter((error) => isTopLevelStructuralError(error, all))
			.map((error) => ({
			code: structuralCode(error),
			path: structuralPath(error),
			message: error.message ?? `Schema validation failed at ${error.schemaPath}.`,
		}))
			.sort(
				(left, right) =>
					(left.message.includes('exactly one schema in oneOf') ? 1 : 0) -
						(right.message.includes('exactly one schema in oneOf') ? 1 : 0) ||
					left.path.localeCompare(right.path),
			);
		const issues: DrawableWorkspaceIssue[] = errors;
		const first = issues[0] ?? {
			code: 'DRAWABLE_WORKSPACE_SCHEMA_INVALID' as const,
			path: '/',
			message: 'DrawableWorkspaceDocument schema validation failed.',
		};
		throw new DrawableWorkspaceError(
			first.code,
			first.path,
			first.message,
			issues,
		);
	}
	return structuredClone(value) as DrawableWorkspaceDocument;
}

export function parseDrawableWorkspaceDocument(
	value: unknown,
): DrawableWorkspaceDocument {
	const structural = parseStructuralDrawableWorkspace(value);
	if (structural.scene.kind === 'chart') {
		structural.scene.document = parseChartScene(
			structural.scene.document,
		) as unknown as WorkspaceChartScene;
	} else {
		structural.scene.document = parseTimeSeriesScene(
			structural.scene.document,
		) as unknown as WorkspaceTimeSeriesScene;
	}
	structural.drawings = parseDrawingDocument(
		structural.drawings,
	) as unknown as WorkspaceDrawingDocument;
	assertSemanticDrawableWorkspace(structural);
	return canonicalizeDrawableWorkspace(structural);
}
