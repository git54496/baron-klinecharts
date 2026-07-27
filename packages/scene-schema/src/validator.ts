import type { ChartScene } from './generated/chart-scene.js';
import { validateChartScene as generatedValidator } from './generated/validate-chart-scene.js';
import { SceneError, type SceneErrorCode, type SceneIssue } from './errors.js';
import { assertSemanticScene } from './semantic-validator.js';
import { canonicalizeScene } from './canonicalize.js';

interface StructuralError {
	readonly instancePath: string;
	readonly schemaPath: string;
	readonly keyword: string;
	readonly message?: string;
}

interface StructuralValidator {
	(value: unknown): boolean;
	errors?: readonly StructuralError[] | null;
}

const validateStructural = generatedValidator as unknown as StructuralValidator;

function structuralCode(error: StructuralError): SceneErrorCode {
	if (error.instancePath.startsWith('/data')) {
		return 'INVALID_MARKET_DATA';
	}
	if (
		error.instancePath.includes('/indicators/') &&
		error.instancePath.endsWith('/name') &&
		error.keyword === 'enum'
	) {
		return 'UNKNOWN_INDICATOR';
	}
	if (
		error.instancePath.startsWith('/overlays/') &&
		error.instancePath.endsWith('/type') &&
		error.keyword === 'enum'
	) {
		return 'UNKNOWN_OVERLAY';
	}
	if (error.instancePath.startsWith('/runtime')) {
		return 'ENGINE_VERSION_MISMATCH';
	}
	if (error.instancePath === '/schema' || error.instancePath === '/version') {
		return 'SCENE_VERSION_UNSUPPORTED';
	}
	return 'SCENE_SCHEMA_INVALID';
}

export function parseStructuralScene(value: unknown): ChartScene {
	if (!validateStructural(value)) {
		const errors = validateStructural.errors ?? [];
		const issues: SceneIssue[] = errors.map((error) => ({
			code: structuralCode(error),
			path: error.instancePath || '/',
			message: error.message ?? `Schema validation failed at ${error.schemaPath}.`,
		}));
		const first = issues[0] ?? {
			code: 'SCENE_SCHEMA_INVALID' as const,
			path: '/',
			message: 'Scene schema validation failed.',
		};
		throw new SceneError(first.code, first.path, first.message, issues);
	}
	return structuredClone(value) as ChartScene;
}

export function parseChartScene(value: unknown): ChartScene {
	const structural = parseStructuralScene(value);
	assertSemanticScene(structural);
	return canonicalizeScene(structural);
}
