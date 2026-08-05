import {
	parseDrawableWorkspaceDocument,
	parseDrawingDocument,
	serializeCanonicalDrawableWorkspace,
	type DrawableWorkspaceDocument,
	type Drawing,
} from '@baron1996/kline-scene-schema';

import {
	assertPositionalCount,
	parseStrictArguments,
	requirePositional,
	requireStringFlag,
} from '../args.js';
import { CliError } from '../errors.js';
import {
	assertDistinctInputOutput,
	readJsonFile,
	readWorkspaceFile,
	writeOutputAtomic,
} from '../files.js';
import { formatJson } from '../json.js';

export type DrawingsAction = 'list' | 'get' | 'add' | 'replace' | 'remove';

function findDrawing(
	workspace: DrawableWorkspaceDocument,
	id: string,
): Drawing {
	const drawing = workspace.drawings.drawings.find(
		(candidate) => candidate.id === id,
	);
	if (drawing === undefined) {
		throw new CliError(
			'COLLECTION_ITEM_NOT_FOUND',
			'/drawings',
			`Drawing not found: ${id}`,
		);
	}
	return drawing;
}

async function readDrawing(path: string): Promise<Drawing> {
	const value = await readJsonFile(path);
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new CliError(
			'CLI_ARGUMENT_INVALID',
			path,
			'Drawing input must be a JSON object.',
		);
	}
	return value as Drawing;
}

export async function queryDrawings(
	inputPath: string,
	action: 'list' | 'get',
	id?: string,
): Promise<readonly Drawing[] | Drawing> {
	const workspace = await readWorkspaceFile(inputPath);
	if (action === 'list') {
		return workspace.drawings.drawings;
	}
	if (id === undefined) {
		throw new CliError(
			'CLI_ARGUMENT_INVALID',
			'/arguments/id',
			'--id is required.',
		);
	}
	return findDrawing(workspace, id);
}

export async function mutateDrawings(options: {
	readonly inputPath: string;
	readonly outputPath: string;
	readonly action: 'add' | 'replace' | 'remove';
	readonly id?: string;
	readonly itemPath?: string;
	readonly force: boolean;
}): Promise<void> {
	assertDistinctInputOutput(options.inputPath, options.outputPath);
	const workspace = await readWorkspaceFile(options.inputPath);
	const drawings = [...workspace.drawings.drawings];

	if (options.action === 'remove') {
		if (options.id === undefined) {
			throw new CliError(
				'CLI_ARGUMENT_INVALID',
				'/arguments/id',
				'--id is required.',
			);
		}
		findDrawing(workspace, options.id);
		const next = drawings.filter((drawing) => drawing.id !== options.id);
		await writeWorkspaceDrawings(workspace, next, options.outputPath, options.force);
		return;
	}
	if (options.itemPath === undefined) {
		throw new CliError(
			'CLI_ARGUMENT_INVALID',
			'/arguments/drawing',
			'--drawing is required.',
		);
	}
	const drawing = await readDrawing(options.itemPath);
	const existingIndex = drawings.findIndex(
		(candidate) => candidate.id === drawing.id,
	);
	if (options.action === 'add') {
		if (existingIndex >= 0) {
			throw new CliError(
				'COLLECTION_ITEM_EXISTS',
				'/drawings',
				`Drawing already exists: ${drawing.id}`,
			);
		}
		drawings.push(drawing);
	} else {
		if (options.id !== undefined && options.id !== drawing.id) {
			throw new CliError(
				'CLI_ARGUMENT_INVALID',
				'/arguments/id',
				'--id must match the replacement Drawing id.',
			);
		}
		if (existingIndex < 0) {
			throw new CliError(
				'COLLECTION_ITEM_NOT_FOUND',
				'/drawings',
				`Drawing not found: ${drawing.id}`,
			);
		}
		drawings[existingIndex] = drawing;
	}
	await writeWorkspaceDrawings(workspace, drawings, options.outputPath, options.force);
}

async function writeWorkspaceDrawings(
	workspace: DrawableWorkspaceDocument,
	drawings: readonly Drawing[],
	outputPath: string,
	force: boolean,
): Promise<void> {
	// 与输入 Workspace 同 scope/坐标绑定，仅替换 drawings，再走完整根文档校验。
	const drawingDocument = parseDrawingDocument({
		...workspace.drawings,
		drawings,
	});
	const output = parseDrawableWorkspaceDocument({
		...workspace,
		drawings: drawingDocument,
	});
	await writeOutputAtomic(
		outputPath,
		serializeCanonicalDrawableWorkspace(output),
		force,
	);
}

/** workspace drawings 子命令入口：解析固定参数并分派查询/变更。 */
export async function runDrawingsCollection(
	arguments_: readonly string[],
): Promise<void> {
	const parsed = parseStrictArguments(arguments_, [
		'id',
		'drawing',
		'output',
		'force',
	]);
	const action = requirePositional(parsed, 0, 'drawings action');
	const inputPath = requirePositional(parsed, 1, 'Workspace input path');
	assertPositionalCount(parsed, 2);

	if (action === 'list' || action === 'get') {
		const id = typeof parsed.values.id === 'string' ? parsed.values.id : undefined;
		process.stdout.write(
			formatJson(await queryDrawings(inputPath, action, id)),
		);
		return;
	}
	if (action !== 'add' && action !== 'replace' && action !== 'remove') {
		throw new CliError(
			'CLI_ARGUMENT_INVALID',
			'/arguments',
			`Unknown drawings action: ${action}`,
		);
	}
	const outputPath = requireStringFlag(parsed, 'output');
	const id = typeof parsed.values.id === 'string' ? parsed.values.id : undefined;
	const itemPath = typeof parsed.values.drawing === 'string'
		? parsed.values.drawing
		: undefined;
	await mutateDrawings({
		inputPath,
		outputPath,
		action,
		force: parsed.values.force === true,
		...(id === undefined ? {} : { id }),
		...(itemPath === undefined ? {} : { itemPath }),
	});
}
