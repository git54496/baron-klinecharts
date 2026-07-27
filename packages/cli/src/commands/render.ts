import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

import {
	buildStandaloneHtml,
	renderScenePng,
} from '@baron1996/klinecharts-render-runtime';

import { CliError } from '../errors.js';
import {
	assertDistinctInputOutput,
	readSceneFile,
	withAtomicOutput,
	writeOutputAtomic,
} from '../files.js';

export async function renderCommand(options: {
	readonly inputPath: string;
	readonly outputPath: string;
	readonly format: string;
	readonly force: boolean;
}): Promise<void> {
	assertDistinctInputOutput(options.inputPath, options.outputPath);
	const scene = await readSceneFile(options.inputPath);
	if (options.format === 'html') {
		await writeOutputAtomic(options.outputPath, buildStandaloneHtml(scene), options.force);
		return;
	}
	if (options.format === 'png') {
		await withAtomicOutput(options.outputPath, options.force, async (temporaryPath) => {
			await renderScenePng(scene, temporaryPath);
		});
		return;
	}
	throw new CliError(
		'CLI_ARGUMENT_INVALID',
		'/arguments/format',
		'--format must be either html or png.',
	);
}

export async function installBrowserCommand(): Promise<void> {
	const require = createRequire(import.meta.url);
	const playwrightCli = require.resolve('playwright/cli');
	const exitCode = await new Promise<number>((resolve, reject) => {
		const child = spawn(process.execPath, [playwrightCli, 'install', 'chromium'], {
			stdio: 'inherit',
			shell: false,
		});
		child.once('error', reject);
		child.once('exit', (code) => resolve(code ?? 1));
	});
	if (exitCode !== 0) {
		throw new CliError(
			'BROWSER_INSTALL_FAILED',
			'/install-browser',
			`Playwright browser installation exited with code ${exitCode}.`,
		);
	}
}
