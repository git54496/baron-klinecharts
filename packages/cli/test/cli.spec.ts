import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDirectory = resolve(packageDirectory, '..', '..');
const fixture = join(repositoryDirectory, 'tests', 'fixtures', 'scenes', 'minimal-valid.json');
const workspaceFixture = join(
	repositoryDirectory,
	'tests',
	'fixtures',
	'workspaces',
	'chart-minimal.json',
);
const timeSeriesWorkspaceFixture = join(
	repositoryDirectory,
	'tests',
	'fixtures',
	'workspaces',
	'time-series-minimal.json',
);
const drawingsFixture = join(
	repositoryDirectory,
	'tests',
	'fixtures',
	'drawings',
	'all-drawings.json',
);
const cli = join(packageDirectory, 'dist', 'cli.js');

async function invoke(arguments_: readonly string[]) {
	return execFileAsync(process.execPath, [cli, ...arguments_]);
}

beforeAll(async () => {
	await execFileAsync(
		process.execPath,
		[
			process.env.npm_execpath!,
			'run',
			'build',
			'--workspace',
			'@baron1996/klinecharts-cli',
		],
		{ cwd: repositoryDirectory },
	);
});

describe('ChartScene CLI', () => {
	it('validates and inspects without diagnostic stdout', async () => {
		const validation = await invoke(['validate', fixture]);
		expect(validation.stdout).toBe('');
		expect(validation.stderr).toBe('');
		const inspection = await invoke(['inspect', fixture, '--json']);
		expect(JSON.parse(inspection.stdout)).toMatchObject({
			schema: '@baron1996/kline-scene',
			dataPoints: 3,
			overlays: 0,
		});
		expect(inspection.stderr).toBe('');
	});

	it('lists, adds, gets, replaces, and removes overlays', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-cli-overlay-'));
		const overlayPath = join(directory, 'overlay.json');
		const addedScene = join(directory, 'added.json');
		const removedScene = join(directory, 'removed.json');
		const overlay = JSON.parse(
			await readFile(
				join(repositoryDirectory, 'tests', 'fixtures', 'scenes', 'all-overlays.json'),
				'utf8',
			),
		).overlays[0];
		await writeFile(overlayPath, JSON.stringify(overlay));
		expect(JSON.parse((await invoke(['overlays', 'list', fixture])).stdout)).toEqual([]);
		await invoke(['overlays', 'add', fixture, '--overlay', overlayPath, '--output', addedScene]);
		expect(JSON.parse((await invoke(['overlays', 'get', addedScene, '--id', overlay.id])).stdout).id)
			.toBe(overlay.id);
		overlay.value += 1;
		await writeFile(overlayPath, JSON.stringify(overlay));
		const replacedScene = join(directory, 'replaced.json');
		await invoke([
			'overlays', 'replace', addedScene, '--id', overlay.id, '--overlay', overlayPath,
			'--output', replacedScene,
		]);
		await invoke([
			'overlays', 'remove', replacedScene, '--id', overlay.id, '--output', removedScene,
		]);
		expect(JSON.parse(await readFile(removedScene, 'utf8')).overlays).toEqual([]);
	}, 60_000);

	it('lists, adds, gets, replaces, and removes indicators', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-cli-indicator-'));
		const source = JSON.parse(await readFile(fixture, 'utf8'));
		const indicatorFixture = JSON.parse(
			await readFile(
				join(repositoryDirectory, 'tests', 'fixtures', 'scenes', 'all-indicators.json'),
				'utf8',
			),
		);
		const indicator = indicatorFixture.panes
			.flatMap((pane: { indicators: unknown[] }) => pane.indicators)[0];
		indicator.paneId = source.panes[0].id;
		indicator.yAxisId = source.panes[0].yAxes[0].id;
		const indicatorPath = join(directory, 'indicator.json');
		await writeFile(indicatorPath, JSON.stringify(indicator));
		const blank = JSON.parse(await readFile(fixture, 'utf8'));
		const blankPath = join(directory, 'blank.json');
		await writeFile(blankPath, JSON.stringify(blank));
		const added = join(directory, 'added.json');
		await invoke(['indicators', 'add', blankPath, '--indicator', indicatorPath, '--output', added]);
		expect(JSON.parse((await invoke(['indicators', 'get', added, '--id', indicator.id])).stdout).id)
			.toBe(indicator.id);
		indicator.precision += 1;
		await writeFile(indicatorPath, JSON.stringify(indicator));
		const replaced = join(directory, 'replaced.json');
		await invoke([
			'indicators', 'replace', added, '--id', indicator.id, '--indicator', indicatorPath,
			'--output', replaced,
		]);
		const removed = join(directory, 'removed.json');
		await invoke(['indicators', 'remove', replaced, '--id', indicator.id, '--output', removed]);
		expect(JSON.parse((await invoke(['indicators', 'list', removed])).stdout)).toEqual([]);
	}, 60_000);

	it('renders self-contained HTML and PNG', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-cli-render-'));
		const html = join(directory, 'scene.html');
		const png = join(directory, 'scene.png');
		await invoke(['render', fixture, '--format', 'html', '--output', html]);
		expect(await readFile(html, 'utf8')).toContain('__BARON_KLINE_SCENE__');
		await invoke(['render', fixture, '--format', 'png', '--output', png]);
		expect((await readFile(png)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
	}, 60_000);

	it('uses stderr-only JSON errors and rejects unknown flags', async () => {
		try {
			await invoke(['validate', fixture, '--unknown']);
			throw new Error('Expected CLI failure.');
		} catch (error) {
			const result = error as { stdout: string; stderr: string };
			expect(result.stdout).toBe('');
			const diagnostic = JSON.parse(result.stderr);
			expect(diagnostic.code).toBe('CLI_ARGUMENT_INVALID');
			expect(diagnostic.issues).toHaveLength(1);
		}
	});
});

describe('DrawableWorkspace CLI', () => {
	it('validates and inspects chart and time-series Workspaces', async () => {
		const chartValidation = await invoke(['workspace', 'validate', workspaceFixture]);
		expect(chartValidation.stdout).toBe('');
		expect(chartValidation.stderr).toBe('');
		const timeSeriesValidation = await invoke([
			'workspace', 'validate', timeSeriesWorkspaceFixture,
		]);
		expect(timeSeriesValidation.stderr).toBe('');
		const inspection = await invoke([
			'workspace', 'inspect', workspaceFixture, '--json',
		]);
		expect(JSON.parse(inspection.stdout)).toMatchObject({
			schema: '@baron1996/drawable-workspace',
			kind: 'chart',
			drawings: 22,
			panes: 1,
			indicators: 0,
		});
		expect(inspection.stderr).toBe('');
		const timeSeriesInspection = await invoke([
			'workspace', 'inspect', timeSeriesWorkspaceFixture, '--json',
		]);
		expect(JSON.parse(timeSeriesInspection.stdout)).toMatchObject({
			kind: 'time-series',
			drawings: 22,
			series: 3,
		});
	});

	it('lists, adds, gets, replaces, and removes drawings', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-cli-drawings-'));
		const drawingSource = JSON.parse(await readFile(drawingsFixture, 'utf8'));
		const drawing = structuredClone(drawingSource.drawings[0]);
		drawing.id = 'drawing-cli-added';
		drawing.geometry.value = 13.25;
		const drawingPath = join(directory, 'drawing.json');
		await writeFile(drawingPath, JSON.stringify(drawing));
		const added = join(directory, 'added.json');
		const replaced = join(directory, 'replaced.json');
		const removed = join(directory, 'removed.json');

		const listed = JSON.parse((await invoke([
			'workspace', 'drawings', 'list', workspaceFixture,
		])).stdout);
		expect(listed).toHaveLength(22);

		await invoke([
			'workspace', 'drawings', 'add', workspaceFixture,
			'--drawing', drawingPath, '--output', added,
		]);
		expect(JSON.parse((await invoke([
			'workspace', 'drawings', 'get', added, '--id', drawing.id,
		])).stdout).geometry.value).toBe(13.25);
		expect(JSON.parse((await invoke([
			'workspace', 'drawings', 'list', added,
		])).stdout)).toHaveLength(23);

		drawing.geometry.value = 14.75;
		await writeFile(drawingPath, JSON.stringify(drawing));
		await invoke([
			'workspace', 'drawings', 'replace', added,
			'--id', drawing.id, '--drawing', drawingPath, '--output', replaced,
		]);
		expect(JSON.parse((await invoke([
			'workspace', 'drawings', 'get', replaced, '--id', drawing.id,
		])).stdout).geometry.value).toBe(14.75);

		await invoke([
			'workspace', 'drawings', 'remove', replaced,
			'--id', drawing.id, '--output', removed,
		]);
		expect(JSON.parse((await invoke([
			'workspace', 'drawings', 'list', removed,
		])).stdout)).toHaveLength(22);
		expect(JSON.parse((await invoke([
			'workspace', 'inspect', removed, '--json',
		])).stdout)).toMatchObject({ schema: '@baron1996/drawable-workspace' });
	}, 60_000);

	it('renders Workspace HTML and PNG through the explicit namespace', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-cli-workspace-render-'));
		const html = join(directory, 'workspace.html');
		const png = join(directory, 'workspace.png');
		await invoke([
			'workspace', 'render', workspaceFixture,
			'--format', 'html', '--output', html,
		]);
		expect(await readFile(html, 'utf8')).toContain('__BARON_DRAWABLE_WORKSPACE__');
		await invoke([
			'workspace', 'render', workspaceFixture,
			'--format', 'png', '--output', png,
		]);
		expect((await readFile(png)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
	}, 60_000);

	it('rejects cross-root inputs without guessing the parser', async () => {
		try {
			await invoke(['validate', workspaceFixture]);
			throw new Error('Expected legacy validate to reject a Workspace.');
		} catch (error) {
			const diagnostic = JSON.parse((error as { stderr: string }).stderr);
			expect(diagnostic.code).toBe('SCENE_SCHEMA_INVALID');
			expect(diagnostic.path).toBe('/');
		}
		try {
			await invoke(['workspace', 'validate', fixture]);
			throw new Error('Expected workspace validate to reject a raw Scene.');
		} catch (error) {
			const diagnostic = JSON.parse((error as { stderr: string }).stderr);
			expect(diagnostic.code).toBe('DRAWABLE_WORKSPACE_SCHEMA_INVALID');
			expect(diagnostic.path).toBe('/binding');
		}
		try {
			await invoke([
				'overlays', 'list', workspaceFixture,
			]);
			throw new Error('Expected overlays to reject a Workspace.');
		} catch (error) {
			const diagnostic = JSON.parse((error as { stderr: string }).stderr);
			expect(diagnostic.code).toBe('SCENE_SCHEMA_INVALID');
		}
		try {
			await invoke([
				'indicators', 'list', workspaceFixture,
			]);
			throw new Error('Expected indicators to reject a Workspace.');
		} catch (error) {
			const diagnostic = JSON.parse((error as { stderr: string }).stderr);
			expect(diagnostic.code).toBe('SCENE_SCHEMA_INVALID');
		}
		try {
			await invoke([
				'render', workspaceFixture, '--format', 'html', '--output', '/tmp/should-not-exist.html',
			]);
			throw new Error('Expected render to reject a Workspace.');
		} catch (error) {
			const diagnostic = JSON.parse((error as { stderr: string }).stderr);
			expect(diagnostic.code).toBe('SCENE_SCHEMA_INVALID');
		}
	}, 60_000);

	it('keeps input/output distinct and replaces existing output only with --force', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'baron-cli-workspace-atomic-'));
		const output = join(directory, 'next.json');
		const drawingSource = JSON.parse(await readFile(drawingsFixture, 'utf8'));
		const drawing = structuredClone(drawingSource.drawings[0]);
		drawing.id = 'drawing-cli-atomic';
		const drawingPath = join(directory, 'drawing.json');
		await writeFile(drawingPath, JSON.stringify(drawing));
		await invoke([
			'workspace', 'drawings', 'add', workspaceFixture,
			'--drawing', drawingPath, '--output', output,
		]);
		try {
			await invoke([
				'workspace', 'drawings', 'add', output,
				'--drawing', drawingPath, '--output', output,
			]);
			throw new Error('Expected input/output conflict.');
		} catch (error) {
			const diagnostic = JSON.parse((error as { stderr: string }).stderr);
			expect(diagnostic.code).toBe('INPUT_OUTPUT_CONFLICT');
		}
		try {
			await invoke([
				'workspace', 'drawings', 'add', output,
				'--drawing', drawingPath, '--output', output,
				'--force',
			]);
			throw new Error('Expected conflict even with --force.');
		} catch (error) {
			const diagnostic = JSON.parse((error as { stderr: string }).stderr);
			expect(diagnostic.code).toBe('INPUT_OUTPUT_CONFLICT');
		}
	}, 60_000);
});
