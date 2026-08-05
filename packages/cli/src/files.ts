import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
	access,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import {
	parseChartScene,
	parseDrawableWorkspaceDocument,
	type ChartScene,
	type DrawableWorkspaceDocument,
} from '@baron1996/kline-scene-schema';

import { CliError } from './errors.js';

async function exists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export async function readJsonFile(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliError('INPUT_READ_FAILED', path, `Unable to read JSON input: ${message}`);
	}
}

export async function readSceneFile(path: string): Promise<ChartScene> {
	return parseChartScene(await readJsonFile(path));
}

/** 显式读取并校验 DrawableWorkspaceDocument；raw Scene 在此失败而非猜测解析。 */
export async function readWorkspaceFile(
	path: string,
): Promise<DrawableWorkspaceDocument> {
	return parseDrawableWorkspaceDocument(await readJsonFile(path));
}

export function assertDistinctInputOutput(inputPath: string, outputPath: string): void {
	if (resolve(inputPath) === resolve(outputPath)) {
		throw new CliError(
			'INPUT_OUTPUT_CONFLICT',
			outputPath,
			'The output path must differ from the input path.',
		);
	}
}

function temporaryPathFor(outputPath: string): string {
	const target = resolve(outputPath);
	return resolve(
		dirname(target),
		`.${basename(target)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
	);
}

export async function withAtomicOutput(
	outputPath: string,
	force: boolean,
	writeTemporary: (temporaryPath: string) => Promise<void>,
): Promise<void> {
	const target = resolve(outputPath);
	if (!force && await exists(target)) {
		throw new CliError('OUTPUT_EXISTS', outputPath, 'Output already exists. Pass --force to replace it.');
	}
	await mkdir(dirname(target), { recursive: true });
	const temporaryPath = temporaryPathFor(target);
	try {
		await writeTemporary(temporaryPath);
		if (!force && await exists(target)) {
			throw new CliError('OUTPUT_EXISTS', outputPath, 'Output was created concurrently.');
		}
		await rename(temporaryPath, target);
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

export async function writeOutputAtomic(
	outputPath: string,
	content: string | Uint8Array,
	force: boolean,
): Promise<void> {
	await withAtomicOutput(outputPath, force, async (temporaryPath) => {
		await writeFile(temporaryPath, content, { flag: 'wx' });
	});
}
