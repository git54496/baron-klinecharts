import type { TimeSeriesScene } from './generated/time-series-scene.js';
import { validateTimeSeriesScene as generatedValidator } from './generated/validate-time-series-scene.js';
import { canonicalizeTimeSeriesScene } from './time-series-canonicalize.js';
import {
	TimeSeriesSceneError,
	type TimeSeriesSceneErrorCode,
	type TimeSeriesSceneIssue,
} from './time-series-errors.js';
import { assertSemanticTimeSeriesScene } from './time-series-semantic-validator.js';

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

function structuralCode(error: StructuralError): TimeSeriesSceneErrorCode {
	if (error.instancePath === '/version' && error.keyword === 'const') {
		return 'TIME_SERIES_SCENE_VERSION_UNSUPPORTED';
	}
	if (
		(error.instancePath === '/runtime/engine' ||
			error.instancePath === '/runtime/engineVersion') &&
		error.keyword === 'const'
	) {
		return 'TIME_SERIES_ENGINE_VERSION_MISMATCH';
	}
	return 'TIME_SERIES_SCENE_SCHEMA_INVALID';
}

export function parseStructuralTimeSeriesScene(value: unknown): TimeSeriesScene {
	if (!validateStructural(value)) {
		const errors = validateStructural.errors ?? [];
		const issues: TimeSeriesSceneIssue[] = errors.map((error) => ({
			code: structuralCode(error),
			path: structuralPath(error),
			message: error.message ?? `Schema validation failed at ${error.schemaPath}.`,
		}));
		const first = issues[0] ?? {
			code: 'TIME_SERIES_SCENE_SCHEMA_INVALID' as const,
			path: '/',
			message: 'TimeSeriesScene schema validation failed.',
		};
		throw new TimeSeriesSceneError(
			first.code,
			first.path,
			first.message,
			issues,
		);
	}
	return structuredClone(value) as TimeSeriesScene;
}

export function parseTimeSeriesScene(value: unknown): TimeSeriesScene {
	const structural = parseStructuralTimeSeriesScene(value);
	assertSemanticTimeSeriesScene(structural);
	return canonicalizeTimeSeriesScene(structural);
}
