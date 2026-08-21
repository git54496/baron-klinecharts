import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { packPublicPackages, runNpm } from './helpers/pack.mjs';

test('packed packages expose DrawableWorkspace declarations and a working CLI namespace', async () => {
	const { directory, packages } = await packPublicPackages();
	const consumer = join(directory, 'consumer');
	await mkdir(consumer, { recursive: true });
	await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
	runNpm(
		[
			'install',
			'--ignore-scripts',
			...packages.map((packed) => packed.tarball),
		],
		{ cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
	);

	const workspaceFixture = resolve(
		'tests',
		'fixtures',
		'workspaces',
		'chart-minimal.json',
	);
	await writeFile(
		join(consumer, 'workspace.ts'),
		[
			"import {",
			"  parseDrawableWorkspaceDocument,",
			"  parseDrawingDocument,",
			"  serializeCanonicalDrawableWorkspace,",
			"  type DrawableWorkspaceDocument,",
			"  type DrawingDocument,",
			"} from '@baron1996/kline-scene-schema';",
			"import { createCrossPeriodDrawingCoordinator, createDrawableWorkspaceRuntime, type CrossPeriodDrawingCoordinator, type CrossPeriodInstrumentBinding, type CrossPeriodWorkspaceRuntimePort, type DrawableWorkspaceRuntime } from '@baron1996/klinecharts-runtime';",
			"import type { DrawingEnginePort } from '@baron1996/klinecharts-adapter';",
			'',
			'const parser: typeof parseDrawableWorkspaceDocument = parseDrawableWorkspaceDocument;',
			'const drawingParser: typeof parseDrawingDocument = parseDrawingDocument;',
			'const runtimeFactory: typeof createDrawableWorkspaceRuntime = createDrawableWorkspaceRuntime;',
			'const coordinatorFactory: typeof createCrossPeriodDrawingCoordinator = createCrossPeriodDrawingCoordinator;',
			'const workspaceType: DrawableWorkspaceDocument | undefined = undefined;',
			'const drawingType: DrawingDocument | undefined = undefined;',
			'const enginePort: DrawingEnginePort | undefined = undefined;',
			'const runtimeType: DrawableWorkspaceRuntime | undefined = undefined;',
			'const coordinatorType: CrossPeriodDrawingCoordinator | undefined = undefined;',
			'const coordinatorPort: CrossPeriodWorkspaceRuntimePort | undefined = runtimeType;',
			'const inspectCrossPeriodRuntime = (value: DrawableWorkspaceRuntime) => {',
			"  const commitMode: 'immediate' | 'host-confirmed' = value.commitMode;",
			'  const sessionState = value.getDrawingSessionState();',
			'  void commitMode; void sessionState;',
			'};',
			"const binding: CrossPeriodInstrumentBinding = { instrumentKey: 'CN:600519', scopeKey: 'instrument:CN:600519' };",
			'if (typeof parser !== "function" || typeof drawingParser !== "function") throw new Error("parsers missing");',
			'if (typeof runtimeFactory !== "function") throw new Error("runtime factory missing");',
			'if (typeof coordinatorFactory !== "function") throw new Error("coordinator factory missing");',
			'void workspaceType; void drawingType; void enginePort; void runtimeType;',
			'void coordinatorType; void coordinatorPort; void inspectCrossPeriodRuntime; void binding;',
			'void serializeCanonicalDrawableWorkspace;',
		].join('\n'),
	);
	await writeFile(
		join(consumer, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				lib: ['ES2023', 'DOM'],
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				noEmit: true,
				strict: true,
				target: 'ES2023',
			},
			include: ['workspace.ts'],
		}, null, 2),
	);
	execFileSync(
		resolve('node_modules', '.bin', 'tsc'),
		['--project', join(consumer, 'tsconfig.json')],
		{ cwd: consumer, stdio: 'inherit' },
	);

	await writeFile(
		join(consumer, 'workspace.mjs'),
		[
			"import { readFile } from 'node:fs/promises';",
			"import { parseDrawableWorkspaceDocument, serializeCanonicalDrawableWorkspace, hashCanonicalDrawableWorkspace } from '@baron1996/kline-scene-schema';",
			"const raw = JSON.parse(await readFile(process.argv[2], 'utf8'));",
			'const workspace = parseDrawableWorkspaceDocument(raw);',
			"if (workspace.schema !== '@baron1996/drawable-workspace') throw new Error('schema mismatch');",
			"if (serializeCanonicalDrawableWorkspace(workspace).byteLength <= 0) throw new Error('canonical bytes missing');",
			"if ((await hashCanonicalDrawableWorkspace(workspace)).length !== 64) throw new Error('hash missing');",
		].join('\n'),
	);
	execFileSync(process.execPath, [join(consumer, 'workspace.mjs'), workspaceFixture], {
		cwd: consumer,
		stdio: 'inherit',
	});

	const installPrefix = join(directory, 'consumer-prefix');
	const cliConsumer = join(installPrefix, 'lib');
	await mkdir(cliConsumer, { recursive: true });
	await writeFile(join(cliConsumer, 'package.json'), '{"private":true,"type":"module"}\n');
	runNpm(
		[
			'install',
			'--global',
			'--prefix',
			installPrefix,
			'--ignore-scripts',
			...packages.map((packed) => packed.tarball),
		],
		{ cwd: cliConsumer, stdio: 'inherit' },
	);
	const cli = join(installPrefix, 'bin', 'baron-kline');
	execFileSync(cli, ['workspace', 'validate', workspaceFixture], {
		cwd: cliConsumer,
		stdio: 'inherit',
	});
	const listing = execFileSync(
		cli,
		['workspace', 'drawings', 'list', workspaceFixture],
		{ cwd: cliConsumer, encoding: 'utf8' },
	);
	assert.equal(JSON.parse(listing).length, 22);
	const html = join(cliConsumer, 'workspace.html');
	execFileSync(
		cli,
		['workspace', 'render', workspaceFixture, '--format', 'html', '--output', html],
		{ cwd: cliConsumer, stdio: 'inherit' },
	);
	assert.match(await readFile(html, 'utf8'), /__BARON_DRAWABLE_WORKSPACE__/u);
});
