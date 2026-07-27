import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { renderScenePng } from '@baron1996/klinecharts-render-runtime';

function outputDirectoryFromArguments(arguments_) {
	const outputIndex = arguments_.indexOf('--output');
	const output = outputIndex >= 0 ? arguments_[outputIndex + 1] : undefined;
	if (output === undefined || output.trim() === '') {
		throw new Error('Usage: node tools/render-png-baselines.mjs --output <directory>');
	}
	return resolve(output);
}

async function readScene(name) {
	return JSON.parse(
		await readFile(resolve('tests', 'fixtures', 'scenes', name), 'utf8'),
	);
}

const outputDirectory = outputDirectoryFromArguments(process.argv.slice(2));
await mkdir(outputDirectory, { recursive: true });

for (const [fixture, baseline] of [
	['minimal-valid.json', 'minimal.png'],
	['all-indicators.json', 'all-indicators.png'],
	['all-overlays.json', 'all-overlays.png'],
]) {
	await renderScenePng(
		await readScene(fixture),
		join(outputDirectory, baseline),
	);
}

const dark = await readScene('minimal-valid.json');
dark.chart.layout.backgroundColor = 'rgba(18, 18, 18, 1)';
dark.chart.layout.textColor = 'rgba(238, 238, 238, 1)';
dark.chart.grid.horizontalColor = 'rgba(55, 55, 55, 1)';
dark.chart.grid.verticalColor = 'rgba(55, 55, 55, 1)';
dark.render.background = 'rgba(18, 18, 18, 1)';
await renderScenePng(dark, join(outputDirectory, 'minimal-dark.png'));

process.stdout.write(`PNG baselines written to ${outputDirectory}\n`);
