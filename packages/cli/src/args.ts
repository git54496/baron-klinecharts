import { CliError } from './errors.js';

export interface ParsedArguments {
	readonly positionals: readonly string[];
	readonly values: Readonly<Record<string, string | boolean>>;
}

const BOOLEAN_FLAGS = new Set(['force', 'json']);

export function parseStrictArguments(
	arguments_: readonly string[],
	allowedFlags: readonly string[],
): ParsedArguments {
	const allowed = new Set(allowedFlags);
	const positionals: string[] = [];
	const values: Record<string, string | boolean> = {};

	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index];
		if (argument === undefined) {
			continue;
		}
		if (!argument.startsWith('--')) {
			positionals.push(argument);
			continue;
		}
		const name = argument.slice(2);
		if (name.length === 0 || !allowed.has(name)) {
			throw new CliError('CLI_ARGUMENT_INVALID', '/arguments', `Unknown option: ${argument}`);
		}
		if (name in values) {
			throw new CliError('CLI_ARGUMENT_INVALID', `/arguments/${name}`, `Duplicate option: ${argument}`);
		}
		if (BOOLEAN_FLAGS.has(name)) {
			values[name] = true;
			continue;
		}
		const value = arguments_[index + 1];
		if (value === undefined || value.startsWith('--')) {
			throw new CliError('CLI_ARGUMENT_INVALID', `/arguments/${name}`, `${argument} requires a value.`);
		}
		values[name] = value;
		index++;
	}
	return { positionals, values };
}

export function requirePositional(
	arguments_: ParsedArguments,
	index: number,
	label: string,
): string {
	const value = arguments_.positionals[index];
	if (value === undefined) {
		throw new CliError('CLI_ARGUMENT_INVALID', '/arguments', `Missing ${label}.`);
	}
	return value;
}

export function assertPositionalCount(arguments_: ParsedArguments, expected: number): void {
	if (arguments_.positionals.length !== expected) {
		throw new CliError(
			'CLI_ARGUMENT_INVALID',
			'/arguments',
			`Expected ${expected} positional argument${expected === 1 ? '' : 's'}, received ${arguments_.positionals.length}.`,
		);
	}
}

export function requireStringFlag(arguments_: ParsedArguments, name: string): string {
	const value = arguments_.values[name];
	if (typeof value !== 'string') {
		throw new CliError('CLI_ARGUMENT_INVALID', `/arguments/${name}`, `--${name} is required.`);
	}
	return value;
}
