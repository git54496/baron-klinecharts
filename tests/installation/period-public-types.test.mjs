import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { runNpm } from './helpers/pack.mjs';

test('packed Scene Schema exports Period, TimeSeriesPeriod and DrawingPeriod without conflicts', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'baron-period-types-'));
	const outputDirectory = join(directory, 'tarballs');
	await mkdir(outputDirectory);
	const packed = runNpm(
		['pack', '--json', '--pack-destination', outputDirectory],
		{
			cwd: resolve('packages', 'scene-schema'),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'inherit'],
		},
	);
	const metadata = JSON.parse(packed)[0];
	const tarball = join(outputDirectory, metadata.filename);

	const consumer = join(directory, 'consumer');
	await mkdir(consumer, { recursive: true });
	await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
	runNpm(
		['install', '--ignore-scripts', tarball],
		{ cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
	);

	await writeFile(
		join(consumer, 'period-types.ts'),
		[
			"import { parseDrawingDocument, parseDrawableWorkspaceDocument, type Period, type TimeSeriesPeriod, type DrawingPeriod, type DrawableWorkspaceDocument, type DrawingDocument } from '@baron1996/kline-scene-schema';",
			"const chartPeriod: Period = { span: 1, type: 'day' };",
			"const timeSeriesPeriod: TimeSeriesPeriod = chartPeriod;",
			'const drawingPeriod: DrawingPeriod = timeSeriesPeriod;',
			'const backToChart: Period = drawingPeriod;',
			"if (backToChart.type !== 'day') throw new Error('Period shape mismatch.');",
			'const parser: typeof parseDrawingDocument = parseDrawingDocument;',
			'const workspaceParser: typeof parseDrawableWorkspaceDocument = parseDrawableWorkspaceDocument;',
			'if (typeof parser !== "function") throw new Error("Drawing parser is missing.");',
			'if (typeof workspaceParser !== "function") throw new Error("Workspace parser is missing.");',
			'const workspace: DrawableWorkspaceDocument | undefined = undefined;',
			'const document: DrawingDocument | undefined = undefined;',
			'void workspace; void document;',
		].join('\n'),
	);
	await writeFile(
		join(consumer, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				lib: ['ES2023'],
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				noEmit: true,
				strict: true,
				target: 'ES2023',
			},
			include: ['period-types.ts'],
		}, null, 2),
	);
	execFileSync(
		resolve('node_modules', '.bin', 'tsc'),
		['--project', join(consumer, 'tsconfig.json')],
		{ cwd: consumer, stdio: 'inherit' },
	);
});
