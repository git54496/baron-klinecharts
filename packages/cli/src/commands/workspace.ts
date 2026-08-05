import {
	buildDrawableWorkspaceStandaloneHtml,
	renderDrawableWorkspacePng,
} from '@baron1996/klinecharts-render-runtime';
import {
	hashCanonicalDrawableWorkspace,
	serializeCanonicalDrawableWorkspace,
	type DrawableWorkspaceDocument,
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
	readWorkspaceFile,
	withAtomicOutput,
	writeOutputAtomic,
} from '../files.js';
import { formatJson } from '../json.js';
import { runDrawingsCollection } from './drawings.js';

export async function validateWorkspaceCommand(inputPath: string): Promise<void> {
	await readWorkspaceFile(inputPath);
}

export async function inspectWorkspaceCommand(
	inputPath: string,
): Promise<Record<string, unknown>> {
	const workspace = await readWorkspaceFile(inputPath);
	const scene = workspace.scene.document;
	const isChart = workspace.scene.kind === 'chart';
	const dataPoints = (scene as { data: readonly unknown[] }).data.length;
	return {
		schema: workspace.schema,
		version: workspace.version,
		kind: workspace.scene.kind,
		sceneSchema: (scene as { schema: string }).schema,
		dataPoints,
		...(
			isChart
				? {
						panes: (scene as unknown as { panes: readonly unknown[] }).panes.length,
						indicators: (scene as unknown as { panes: readonly { indicators: readonly unknown[] }[] })
							.panes.reduce(
								(total, pane) => total + pane.indicators.length,
								0,
							),
					}
				: { series: (scene as unknown as { series: readonly unknown[] }).series.length }
		),
		drawings: workspace.drawings.drawings.length,
		canonicalBytes: serializeCanonicalDrawableWorkspace(workspace).byteLength,
		sha256: await hashCanonicalDrawableWorkspace(workspace),
	};
}

export async function workspaceRenderCommand(options: {
	readonly inputPath: string;
	readonly outputPath: string;
	readonly format: string;
	readonly force: boolean;
}): Promise<void> {
	assertDistinctInputOutput(options.inputPath, options.outputPath);
	const workspace = await readWorkspaceFile(options.inputPath);
	if (options.format === 'html') {
		await writeOutputAtomic(
			options.outputPath,
			buildDrawableWorkspaceStandaloneHtml(workspace),
			options.force,
		);
		return;
	}
	if (options.format === 'png') {
		await withAtomicOutput(options.outputPath, options.force, async (temporaryPath) => {
			await renderDrawableWorkspacePng(workspace, temporaryPath);
		});
		return;
	}
	throw new CliError(
		'CLI_ARGUMENT_INVALID',
		'/arguments/format',
		'--format must be either html or png.',
	);
}

/** workspace 根命令：显式校验/检视/画线集合/渲染，不做根类型猜测。 */
export async function workspaceCommand(
	arguments_: readonly string[],
): Promise<void> {
	const action = arguments_[0];
	const actionArguments = arguments_.slice(1);
	switch (action) {
		case 'validate': {
			const parsed = parseStrictArguments(actionArguments, []);
			assertPositionalCount(parsed, 1);
			await validateWorkspaceCommand(
				requirePositional(parsed, 0, 'Workspace input path'),
			);
			return;
		}
		case 'inspect': {
			const parsed = parseStrictArguments(actionArguments, ['json']);
			assertPositionalCount(parsed, 1);
			if (parsed.values.json !== true) {
				throw new CliError(
					'CLI_ARGUMENT_INVALID',
					'/arguments/json',
					'inspect requires --json.',
				);
			}
			process.stdout.write(
				formatJson(
					await inspectWorkspaceCommand(
						requirePositional(parsed, 0, 'Workspace input path'),
					),
				),
			);
			return;
		}
		case 'drawings':
			await runDrawingsCollection(actionArguments);
			return;
		case 'render': {
			const parsed = parseStrictArguments(actionArguments, [
				'format',
				'output',
				'force',
			]);
			assertPositionalCount(parsed, 1);
			await workspaceRenderCommand({
				inputPath: requirePositional(parsed, 0, 'Workspace input path'),
				outputPath: requireStringFlag(parsed, 'output'),
				format: requireStringFlag(parsed, 'format'),
				force: parsed.values.force === true,
			});
			return;
		}
		default:
			throw new CliError(
				'CLI_ARGUMENT_INVALID',
				'/arguments',
				action === undefined
					? 'A workspace action is required.'
					: `Unknown workspace action: ${action}`,
			);
	}
}
