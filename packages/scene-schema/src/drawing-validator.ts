import type { DrawingDocument } from './generated/drawing-document.js';
import { validateDrawingDocument as generatedValidator } from './generated/validate-drawing-document.js';
import { canonicalizeDrawingDocument } from './drawing-canonicalize.js';
import {
	DrawingDocumentError,
	type DrawingDocumentErrorCode,
	type DrawingDocumentIssue,
} from './drawing-errors.js';
import { assertSemanticDrawingDocument } from './drawing-semantic-validator.js';

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

function structuralCode(_error: StructuralError): DrawingDocumentErrorCode {
	return 'DRAWING_DOCUMENT_SCHEMA_INVALID';
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
	// 只保留 drawing 顶层 type 属性自身的枚举/常量错误，
	// 丢弃 oneOf 分支及其 geometry 子错误，与 Python jsonschema 顶层错误对齐。
	return error.schemaPath.startsWith('#/properties/type/');
}

export function parseStructuralDrawingDocument(value: unknown): DrawingDocument {
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
		const issues: DrawingDocumentIssue[] = errors;
		const first = issues[0] ?? {
			code: 'DRAWING_DOCUMENT_SCHEMA_INVALID' as const,
			path: '/',
			message: 'DrawingDocument schema validation failed.',
		};
		throw new DrawingDocumentError(
			first.code,
			first.path,
			first.message,
			issues,
		);
	}
	return structuredClone(value) as DrawingDocument;
}

export function parseDrawingDocument(value: unknown): DrawingDocument {
	const structural = parseStructuralDrawingDocument(value);
	assertSemanticDrawingDocument(structural);
	return canonicalizeDrawingDocument(structural);
}
