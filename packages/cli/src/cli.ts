#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	assertPositionalCount,
	parseStrictArguments,
	requirePositional,
	requireStringFlag,
} from './args.js';
import { mutateIndicators, queryIndicators } from './commands/indicators.js';
import { inspectCommand } from './commands/inspect.js';
import { mutateOverlays, queryOverlays } from './commands/overlays.js';
import { installBrowserCommand, renderCommand } from './commands/render.js';
import { validateCommand } from './commands/validate.js';
import { workspaceCommand } from './commands/workspace.js';
import { CliError, serializeCliError } from './errors.js';
import { formatJson } from './json.js';

/** CLI 包版本，必须与公共 npm 与 Python 包版本一致。 */
export const CLI_PACKAGE_VERSION = '0.4.1' as const;
/** 场景协议包版本，与首版 Runtime 版本保持一致。 */
export const SCENE_PACKAGE_VERSION = '0.4.1' as const;

function writeJson(value: unknown): void {
	process.stdout.write(formatJson(value));
}

async function runCollection(
	collection: 'overlays' | 'indicators',
	arguments_: readonly string[],
): Promise<void> {
	const parsed = parseStrictArguments(arguments_, ['id', 'overlay', 'indicator', 'output', 'force']);
	const action = requirePositional(parsed, 0, 'collection action');
	const inputPath = requirePositional(parsed, 1, 'Scene input path');
	assertPositionalCount(parsed, 2);

	if (action === 'list' || action === 'get') {
		const id = typeof parsed.values.id === 'string' ? parsed.values.id : undefined;
		writeJson(
			collection === 'overlays'
				? await queryOverlays(inputPath, action, id)
				: await queryIndicators(inputPath, action, id),
		);
		return;
	}
	if (action !== 'add' && action !== 'replace' && action !== 'remove') {
		throw new CliError('CLI_ARGUMENT_INVALID', '/arguments', `Unknown ${collection} action: ${action}`);
	}
	const mutationAction: 'add' | 'replace' | 'remove' = action;
	const outputPath = requireStringFlag(parsed, 'output');
	const id = typeof parsed.values.id === 'string' ? parsed.values.id : undefined;
	const itemFlag = collection === 'overlays' ? 'overlay' : 'indicator';
	const itemPath = typeof parsed.values[itemFlag] === 'string'
		? parsed.values[itemFlag] as string
		: undefined;
	const options = {
		inputPath,
		outputPath,
		action: mutationAction,
		force: parsed.values.force === true,
		...(id === undefined ? {} : { id }),
		...(itemPath === undefined ? {} : { itemPath }),
	};
	if (collection === 'overlays') {
		await mutateOverlays(options);
	} else {
		await mutateIndicators(options);
	}
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
	const command = arguments_[0];
	const rest = arguments_.slice(1);
	switch (command) {
		case 'validate': {
			const parsed = parseStrictArguments(rest, []);
			assertPositionalCount(parsed, 1);
			await validateCommand(requirePositional(parsed, 0, 'Scene input path'));
			return;
		}
		case 'inspect': {
			const parsed = parseStrictArguments(rest, ['json']);
			assertPositionalCount(parsed, 1);
			if (parsed.values.json !== true) {
				throw new CliError('CLI_ARGUMENT_INVALID', '/arguments/json', 'inspect requires --json.');
			}
			writeJson(await inspectCommand(requirePositional(parsed, 0, 'Scene input path')));
			return;
		}
		case 'overlays':
		case 'indicators':
			await runCollection(command, rest);
			return;
		case 'render': {
			const parsed = parseStrictArguments(rest, ['format', 'output', 'force']);
			assertPositionalCount(parsed, 1);
			await renderCommand({
				inputPath: requirePositional(parsed, 0, 'Scene input path'),
				outputPath: requireStringFlag(parsed, 'output'),
				format: requireStringFlag(parsed, 'format'),
				force: parsed.values.force === true,
			});
			return;
		}
		case 'workspace':
			await workspaceCommand(rest);
			return;
		case 'install-browser': {
			const parsed = parseStrictArguments(rest, []);
			assertPositionalCount(parsed, 0);
			await installBrowserCommand();
			return;
		}
		default:
			throw new CliError(
				'CLI_ARGUMENT_INVALID',
				'/arguments',
				command === undefined ? 'A command is required.' : `Unknown command: ${command}`,
			);
	}
}

const invokedPath = process.argv[1];
let isExecutableEntry = false;
if (invokedPath !== undefined) {
	try {
		isExecutableEntry = realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		isExecutableEntry = false;
	}
}
if (isExecutableEntry) {
	main().catch((error: unknown) => {
		process.stderr.write(formatJson(serializeCliError(error)));
		process.exitCode = 1;
	});
}
