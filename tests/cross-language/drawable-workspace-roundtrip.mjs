import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { chromium } from 'playwright';

import {
	DrawableWorkspaceError,
	DrawingDocumentError,
	hashCanonicalDrawableWorkspace,
	hashCanonicalDrawingDocument,
	parseDrawableWorkspaceDocument,
	parseDrawingDocument,
	serializeCanonicalDrawableWorkspace,
	serializeCanonicalDrawingDocument,
} from '@baron1996/kline-scene-schema';
import { buildDrawableWorkspaceStandaloneHtml } from '@baron1996/klinecharts-render-runtime';

const execFileAsync = promisify(execFile);
const repositoryDirectory = resolve('.');
const temporaryDirectory = await mkdtemp(
	join(tmpdir(), 'baron-drawable-workspace-cross-language-'),
);
const python = process.env.BARON_PYTHON ?? 'python3';
const pythonPath = [
	join(repositoryDirectory, 'python', 'baron-klinecharts', 'src'),
	process.env.PYTHONPATH,
].filter(Boolean).join(delimiter);
const pythonFlow = join(
	repositoryDirectory,
	'tests',
	'cross-language',
	'drawable_workspace_python_flow.py',
);
const cli = join(repositoryDirectory, 'packages', 'cli', 'dist', 'cli.js');
const fixture = (path) => join(repositoryDirectory, 'tests', 'fixtures', path);

async function runPython(arguments_) {
	return execFileAsync(python, [pythonFlow, ...arguments_], {
		env: { ...process.env, PYTHONPATH: pythonPath },
	});
}

async function invokeCli(arguments_) {
	return execFileAsync(process.execPath, [cli, ...arguments_]);
}

async function writeInput(name, value) {
	const path = join(temporaryDirectory, name);
	await writeFile(path, JSON.stringify(value));
	return path;
}

async function assertNodePythonBytes(name, kind, nodeBytes, inputPath) {
	const output = join(temporaryDirectory, `${name}-python-canonical.json`);
	await runPython(['canonical', kind, inputPath, output]);
	const pythonBytes = await readFile(output);
	if (!Buffer.from(nodeBytes).equals(pythonBytes)) {
		throw new Error(`${name} canonical bytes differ between Node and Python.`);
	}
}

async function assertNodePythonHash(name, kind, nodeHash, inputPath) {
	const pythonHash = (await runPython(['hash', kind, inputPath])).stdout.trim();
	if (nodeHash !== pythonHash) {
		throw new Error(
			`${name} hashes differ: ${nodeHash} != ${pythonHash}.`,
		);
	}
}

function nodeDrawingError(value) {
	try {
		parseDrawingDocument(value);
	} catch (error) {
		if (error instanceof DrawingDocumentError) {
			return {
				code: error.code,
				path: error.path,
				issues: error.issues.map(({ code, path, message }) => ({
					code,
					path,
					message,
				})),
			};
		}
		throw error;
	}
	throw new Error('Expected invalid DrawingDocument.');
}

function nodeWorkspaceError(value) {
	try {
		parseDrawableWorkspaceDocument(value);
	} catch (error) {
		if (error instanceof DrawableWorkspaceError) {
			return {
				code: error.code,
				path: error.path,
				issues: error.issues.map(({ code, path, message }) => ({
					code,
					path,
					message,
				})),
			};
		}
		throw error;
	}
	throw new Error('Expected invalid DrawableWorkspaceDocument.');
}

async function assertCrossLanguageError(
	name,
	kind,
	value,
	nodeErrorFunction,
) {
	const input = await writeInput(`${name}.json`, value);
	const pythonResult = await runPython(['validate-error', kind, input]);
	const pythonError = JSON.parse(pythonResult.stdout);
	const expected = nodeErrorFunction(value);
	if (JSON.stringify(pythonError) !== JSON.stringify(expected)) {
		throw new Error(
			`${name} error differs: ${JSON.stringify(expected)} != ${JSON.stringify(pythonError)}.`,
		);
	}
}

// Drawing 有效/变体比较。
const allDrawings = JSON.parse(
	await readFile(fixture('drawings/all-drawings.json'), 'utf8'),
);
const parsedDrawings = parseDrawingDocument(allDrawings);
await assertNodePythonBytes(
	'drawing-all',
	'drawing',
	serializeCanonicalDrawingDocument(parsedDrawings),
	fixture('drawings/all-drawings.json'),
);
await assertNodePythonHash(
	'drawing-all',
	'drawing',
	await hashCanonicalDrawingDocument(parsedDrawings),
	fixture('drawings/all-drawings.json'),
);

const shuffled = structuredClone(allDrawings);
shuffled.metadata = { b: 1, a: 2, label: '中文标注' };
shuffled.drawings[2].geometry.text = '中文文本标注';
const shuffledInput = await writeInput('drawing-shuffled.json', shuffled);
await assertNodePythonBytes(
	'drawing-shuffled',
	'drawing',
	serializeCanonicalDrawingDocument(parseDrawingDocument(shuffled)),
	shuffledInput,
);

const timezoneDrawing = structuredClone(allDrawings);
timezoneDrawing.coordinateSystem.timezone = 'America/New_York';
const timezoneInput = await writeInput(
	'drawing-timezone.json',
	timezoneDrawing,
);
await assertNodePythonBytes(
	'drawing-timezone',
	'drawing',
	serializeCanonicalDrawingDocument(parseDrawingDocument(timezoneDrawing)),
	timezoneInput,
);

const precisionZero = {
	...structuredClone(allDrawings),
	coordinateSystem: {
		timezone: 'Asia/Shanghai',
		valueAxes: [
			{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 0 },
		],
	},
	drawings: [structuredClone(allDrawings.drawings[0])],
};
precisionZero.drawings[0].geometry.value = 12;
const precisionZeroInput = await writeInput(
	'drawing-precision-0.json',
	precisionZero,
);
await assertNodePythonBytes(
	'drawing-precision-0',
	'drawing',
	serializeCanonicalDrawingDocument(parseDrawingDocument(precisionZero)),
	precisionZeroInput,
);

const precisionSixteen = structuredClone(precisionZero);
precisionSixteen.coordinateSystem.valueAxes[0].valuePrecision = 16;
precisionSixteen.drawings[0].geometry.value = 1.2345678901234567;
const precisionSixteenInput = await writeInput(
	'drawing-precision-16.json',
	precisionSixteen,
);
await assertNodePythonBytes(
	'drawing-precision-16',
	'drawing',
	serializeCanonicalDrawingDocument(parseDrawingDocument(precisionSixteen)),
	precisionSixteenInput,
);

const exponentDrawing = structuredClone(precisionZero);
exponentDrawing.coordinateSystem.valueAxes[0].valuePrecision = 6;
exponentDrawing.drawings[0].geometry.value = 123456789.123457;
const exponentInput = await writeInput('drawing-exponent.json', exponentDrawing);
await assertNodePythonBytes(
	'drawing-exponent',
	'drawing',
	serializeCanonicalDrawingDocument(parseDrawingDocument(exponentDrawing)),
	exponentInput,
);

// Drawing 错误序列。
await assertCrossLanguageError(
	'drawing-invalid-duplicate',
	'drawing',
	JSON.parse(
		await readFile(fixture('drawings/invalid-duplicate-id.json'), 'utf8'),
	),
	nodeDrawingError,
);
await assertCrossLanguageError(
	'drawing-invalid-target',
	'drawing',
	JSON.parse(
		await readFile(fixture('drawings/invalid-target-missing.json'), 'utf8'),
	),
	nodeDrawingError,
);
await assertCrossLanguageError(
	'drawing-invalid-extra',
	'drawing',
	JSON.parse(
		await readFile(fixture('drawings/invalid-extra-field.json'), 'utf8'),
	),
	nodeDrawingError,
);
await assertCrossLanguageError(
	'drawing-invalid-unknown-type',
	'drawing',
	JSON.parse(
		await readFile(fixture('drawings/invalid-unknown-type.json'), 'utf8'),
	),
	nodeDrawingError,
);
const negativeZero = structuredClone(precisionZero);
negativeZero.coordinateSystem.valueAxes[0].valuePrecision = 2;
negativeZero.drawings[0].geometry.value = -0.004;
await assertCrossLanguageError(
	'drawing-negative-zero',
	'drawing',
	negativeZero,
	nodeDrawingError,
);

// Workspace 有效/变体比较。
const chartWorkspace = JSON.parse(
	await readFile(fixture('workspaces/chart-minimal.json'), 'utf8'),
);
await assertNodePythonBytes(
	'workspace-chart',
	'workspace',
	serializeCanonicalDrawableWorkspace(
		parseDrawableWorkspaceDocument(chartWorkspace),
	),
	fixture('workspaces/chart-minimal.json'),
);
await assertNodePythonHash(
	'workspace-chart',
	'workspace',
	await hashCanonicalDrawableWorkspace(
		parseDrawableWorkspaceDocument(chartWorkspace),
	),
	fixture('workspaces/chart-minimal.json'),
);

const timeSeriesWorkspace = JSON.parse(
	await readFile(fixture('workspaces/time-series-minimal.json'), 'utf8'),
);
await assertNodePythonBytes(
	'workspace-time-series',
	'workspace',
	serializeCanonicalDrawableWorkspace(
		parseDrawableWorkspaceDocument(timeSeriesWorkspace),
	),
	fixture('workspaces/time-series-minimal.json'),
);

const areaScene = JSON.parse(
	await readFile(fixture('scenes/chart-area-close-line.json'), 'utf8'),
);
const areaWorkspace = {
	...structuredClone(chartWorkspace),
	scene: { kind: 'chart', document: areaScene },
};
const areaInput = await writeInput('workspace-area.json', areaWorkspace);
await assertNodePythonBytes(
	'workspace-area',
	'workspace',
	serializeCanonicalDrawableWorkspace(
		parseDrawableWorkspaceDocument(areaWorkspace),
	),
	areaInput,
);

const indicatorWorkspace = structuredClone(chartWorkspace);
indicatorWorkspace.scene.document.panes.push({
	id: 'pane-indicators',
	kind: 'indicator',
	order: 1,
	height: 240,
	minHeight: 100,
	state: 'normal',
	yAxes: [
		{
			id: 'axis-indicators',
			role: 'primary',
			position: 'right',
			reverse: false,
			inside: false,
			scrollZoomEnabled: true,
			topGap: 0.1,
			bottomGap: 0.1,
			scale: 'linear',
		},
	],
	indicators: [
		{
			id: 'indicator-ma-0',
			name: 'MA',
			paneId: 'pane-indicators',
			yAxisId: 'axis-indicators',
			calcParams: [5, 10, 30, 60],
			precision: 6,
			visible: true,
			zLevel: 0,
			styles: {
				lines: [
					{
						color: 'rgba(41, 98, 255, 1)',
						size: 1,
						style: 'solid',
					},
				],
				bars: [],
				circles: [],
			},
		},
	],
});
indicatorWorkspace.drawings.coordinateSystem.valueAxes.push({
	paneRole: 'indicator:indicator-ma-0',
	yAxisRole: 'primary',
	valuePrecision: 6,
});
indicatorWorkspace.binding.valueAxes =
	indicatorWorkspace.drawings.coordinateSystem.valueAxes;
const indicatorDrawing = structuredClone(allDrawings.drawings[0]);
indicatorDrawing.id = 'drawing-indicator-ma';
indicatorDrawing.target = {
	paneRole: 'indicator:indicator-ma-0',
	yAxisRole: 'primary',
};
indicatorDrawing.geometry.value = 12.345678;
indicatorWorkspace.drawings.drawings.push(indicatorDrawing);
const indicatorInput = await writeInput(
	'workspace-indicator.json',
	indicatorWorkspace,
);
await assertNodePythonBytes(
	'workspace-indicator',
	'workspace',
	serializeCanonicalDrawableWorkspace(
		parseDrawableWorkspaceDocument(indicatorWorkspace),
	),
	indicatorInput,
);

// Workspace 错误序列。
await assertCrossLanguageError(
	'workspace-double-authority',
	'workspace',
	JSON.parse(
		await readFile(
			fixture('workspaces/invalid-double-authority.json'),
			'utf8',
		),
	),
	nodeWorkspaceError,
);
const scopeMismatch = structuredClone(chartWorkspace);
scopeMismatch.binding.scopeKey = 'other-scope';
await assertCrossLanguageError(
	'workspace-binding-mismatch',
	'workspace',
	scopeMismatch,
	nodeWorkspaceError,
);
const rawScene = JSON.parse(
	await readFile(fixture('scenes/minimal-valid.json'), 'utf8'),
);
await assertCrossLanguageError(
	'workspace-raw-scene',
	'workspace',
	rawScene,
	nodeWorkspaceError,
);

// ---------- Step 11.1：完整跨语言旅程 ----------

async function cliDrawingCrud(inputPath, drawing, name) {
	const drawingPath = join(temporaryDirectory, `${name}-drawing.json`);
	await writeFile(drawingPath, JSON.stringify(drawing));
	const added = join(temporaryDirectory, `${name}-added.json`);
	const replaced = join(temporaryDirectory, `${name}-replaced.json`);
	const removed = join(temporaryDirectory, `${name}-removed.json`);
	await invokeCli([
		'workspace', 'drawings', 'add', inputPath,
		'--drawing', drawingPath, '--output', added,
	]);
	const listed = JSON.parse(
		(await invokeCli(['workspace', 'drawings', 'list', added])).stdout,
	);
	if (listed.length !== 23) {
		throw new Error(`${name} CLI add produced ${listed.length} drawings.`);
	}
	const created = JSON.parse(
		(await invokeCli([
			'workspace', 'drawings', 'get', added, '--id', drawing.id,
		])).stdout,
	);
	if (created.id !== drawing.id) {
		throw new Error(`${name} CLI get returned the wrong drawing.`);
	}
	drawing.geometry.value += 1;
	await writeFile(drawingPath, JSON.stringify(drawing));
	await invokeCli([
		'workspace', 'drawings', 'replace', added,
		'--id', drawing.id, '--drawing', drawingPath, '--output', replaced,
	]);
	await invokeCli([
		'workspace', 'drawings', 'remove', replaced,
		'--id', drawing.id, '--output', removed,
	]);
	return removed;
}

async function browserWorkspaceJourney(inputPath, name, switchSequence) {
	const workspace = parseDrawableWorkspaceDocument(
		JSON.parse(await readFile(inputPath, 'utf8')),
	);
	const htmlPath = join(temporaryDirectory, `${name}.html`);
	await writeFile(htmlPath, buildDrawableWorkspaceStandaloneHtml(workspace));
	const scene = workspace.scene.document;
	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({
			viewport: {
				width: scene.render.width,
				height: scene.render.height,
			},
			deviceScaleFactor: scene.render.deviceScaleFactor,
			locale: scene.chart.locale,
			timezoneId: scene.chart.timezone,
			offline: true,
			serviceWorkers: 'block',
			reducedMotion: 'reduce',
		});
		try {
			const page = await context.newPage();
			await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
			await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.ready);
			await page.locator('[data-overlay-type="segment"]').click();
			// 主窗格 overlay 是可见画布中的第二个（chart 与 time-series 布局一致）。
			const canvas = page
				.locator('[data-baron-render-root] canvas')
				.filter({ visible: true })
				.nth(1);
			await canvas.click({ position: { x: 400, y: 200 } });
			await page.waitForTimeout(600);
			if (switchSequence !== undefined) {
				// 创建中 candle -> area：主序列切换不得中断 Drawing 会话。
				await page.selectOption('[data-action="main-series"]', switchSequence[0]);
				await page.waitForTimeout(600);
			}
			await canvas.click({ position: { x: 600, y: 300 } });
			await page.waitForTimeout(600);
			const afterCreate = await page.evaluate(
				() => window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace(),
			);
			const snapshots = [];
			if (switchSequence !== undefined) {
				for (const presentation of switchSequence.slice(1)) {
					await page.selectOption('[data-action="main-series"]', presentation);
					await page.waitForTimeout(250);
					snapshots.push(
						await page.evaluate(
							() => window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace(),
						),
					);
				}
			}
			const exported = await page.evaluate(
				() => window.__BARON_DRAWABLE_WORKSPACE__.exportWorkspace(),
			);
			await page.evaluate(() => window.__BARON_DRAWABLE_WORKSPACE__.destroy());
			return { afterCreate, exported, snapshots };
		} finally {
			await context.close();
		}
	} finally {
		await browser.close();
	}
}

async function assertWorkspaceRenderAgreement(name, inputPath) {
	const cliHtml = join(temporaryDirectory, `${name}-cli.html`);
	const cliPng = join(temporaryDirectory, `${name}-cli.png`);
	const pythonHtml = join(temporaryDirectory, `${name}-python.html`);
	const pythonPng = join(temporaryDirectory, `${name}-python.png`);
	await invokeCli([
		'workspace', 'render', inputPath, '--format', 'html', '--output', cliHtml,
	]);
	const cliHtmlBytes = await readFile(cliHtml);
	if (!cliHtmlBytes.includes(Buffer.from('__BARON_DRAWABLE_WORKSPACE__'))) {
		throw new Error(`${name} CLI HTML is missing the Workspace bridge.`);
	}
	await runPython(['render-html', 'workspace', inputPath, pythonHtml]);
	const pythonHtmlBytes = await readFile(pythonHtml);
	if (!Buffer.from(cliHtmlBytes).equals(Buffer.from(pythonHtmlBytes))) {
		throw new Error(`${name} HTML bytes differ between CLI and Python.`);
	}
	await invokeCli([
		'workspace', 'render', inputPath, '--format', 'png', '--output', cliPng,
	]);
	const cliPngBytes = await readFile(cliPng);
	if (!cliPngBytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
		throw new Error(`${name} CLI PNG is not a PNG.`);
	}
	await runPython(['render-png', 'workspace', inputPath, pythonPng]);
	const pythonPngBytes = await readFile(pythonPng);
	if (!Buffer.from(cliPngBytes).equals(Buffer.from(pythonPngBytes))) {
		throw new Error(`${name} PNG bytes differ between CLI and Python.`);
	}
}

// chart Workspace 旅程：Node -> Python -> CLI CRUD -> 离线浏览器 -> Node/Python hash -> CLI/Python HTML/PNG。
const parsedChartJourney = parseDrawableWorkspaceDocument(chartWorkspace);
const chartJourneyInput = await writeInput(
	'journey-chart.json',
	parsedChartJourney,
);
const chartPythonSaved = join(temporaryDirectory, 'journey-chart-python.json');
await runPython(['roundtrip', 'workspace', chartJourneyInput, chartPythonSaved]);
const chartPythonRoundTrip = parseDrawableWorkspaceDocument(
	JSON.parse(await readFile(chartPythonSaved, 'utf8')),
);
if (
	!Buffer.from(serializeCanonicalDrawableWorkspace(chartPythonRoundTrip))
		.equals(Buffer.from(serializeCanonicalDrawableWorkspace(parsedChartJourney)))
) {
	throw new Error('chart Python load/save changed canonical bytes.');
}
const chartCliDrawing = {
	...structuredClone(allDrawings.drawings[0]),
	id: 'drawing-journey-chart',
	geometry: { value: 13.25 },
};
const chartCliRemoved = await cliDrawingCrud(
	chartJourneyInput,
	chartCliDrawing,
	'journey-chart',
);
const chartJourney = await browserWorkspaceJourney(
	chartCliRemoved,
	'journey-chart',
	['area', 'candle_solid', 'area'],
);
if (chartJourney.exported.schema !== '@baron1996/drawable-workspace') {
	throw new Error('chart browser export has the wrong schema.');
}
if (chartJourney.exported.scene.kind !== 'chart') {
	throw new Error('chart browser export changed scene kind.');
}
if (chartJourney.exported.drawings.drawings.length !== 23) {
	throw new Error('chart browser journey did not add the segment.');
}
if (chartJourney.exported.scene.document.chart.candle.type !== 'area') {
	throw new Error('chart browser export is not area after the final switch.');
}
if (chartJourney.snapshots[0]?.scene.document.chart.candle.type !== 'candle_solid') {
	throw new Error('chart post-completion switch did not apply candle.');
}
if (chartJourney.snapshots[1]?.scene.document.chart.candle.type !== 'area') {
	throw new Error('chart second post-completion switch did not apply area.');
}
const chartDrawingBytes = [
	chartJourney.afterCreate,
	...chartJourney.snapshots,
	chartJourney.exported,
].map((workspace) =>
	serializeCanonicalDrawingDocument(
		parseDrawingDocument(workspace.drawings),
	),
);
if (new Set(chartDrawingBytes.map((bytes) => Buffer.from(bytes).toString('hex'))).size !== 1) {
	throw new Error('chart DrawingDocument canonical bytes changed across presentation switches.');
}
const chartOriginalIds = new Set(
	parsedChartJourney.drawings.drawings.map((drawing) => drawing.id),
);
const chartJourneyIds = new Set(
	chartJourney.exported.drawings.drawings.map((drawing) => drawing.id),
);
for (const id of chartOriginalIds) {
	if (!chartJourneyIds.has(id)) {
		throw new Error(`chart journey lost original drawing: ${id}`);
	}
}
const chartNewSegments = chartJourney.exported.drawings.drawings.filter(
	(drawing) =>
		drawing.type === 'segment' && !chartOriginalIds.has(drawing.id),
);
if (chartNewSegments.length !== 1 || chartNewSegments[0].geometry.points.length !== 2) {
	throw new Error('chart journey segment was not created with two points.');
}
const chartExportedInput = await writeInput(
	'journey-chart-exported.json',
	chartJourney.exported,
);
await assertNodePythonBytes(
	'journey-chart-exported',
	'workspace',
	serializeCanonicalDrawableWorkspace(
		parseDrawableWorkspaceDocument(chartJourney.exported),
	),
	chartExportedInput,
);
await assertNodePythonHash(
	'journey-chart-exported',
	'workspace',
	await hashCanonicalDrawableWorkspace(
		parseDrawableWorkspaceDocument(chartJourney.exported),
	),
	chartExportedInput,
);
await assertWorkspaceRenderAgreement('journey-chart', chartExportedInput);

// time-series Workspace 旅程：无主序列切换，其余链路与 chart 一致。
const parsedTimeSeriesJourney = parseDrawableWorkspaceDocument(
	timeSeriesWorkspace,
);
const timeSeriesJourneyInput = await writeInput(
	'journey-time-series.json',
	parsedTimeSeriesJourney,
);
const timeSeriesPythonSaved = join(
	temporaryDirectory,
	'journey-time-series-python.json',
);
await runPython([
	'roundtrip', 'workspace', timeSeriesJourneyInput, timeSeriesPythonSaved,
]);
const timeSeriesPythonRoundTrip = parseDrawableWorkspaceDocument(
	JSON.parse(await readFile(timeSeriesPythonSaved, 'utf8')),
);
if (
	!Buffer.from(serializeCanonicalDrawableWorkspace(timeSeriesPythonRoundTrip))
		.equals(
			Buffer.from(
				serializeCanonicalDrawableWorkspace(parsedTimeSeriesJourney),
			),
		)
) {
	throw new Error('time-series Python load/save changed canonical bytes.');
}
const timeSeriesCliDrawing = {
	...structuredClone(timeSeriesWorkspace.drawings.drawings[0]),
	id: 'drawing-journey-time-series',
	geometry: { value: 12.55 },
};
const timeSeriesCliRemoved = await cliDrawingCrud(
	timeSeriesJourneyInput,
	timeSeriesCliDrawing,
	'journey-time-series',
);
const timeSeriesJourney = await browserWorkspaceJourney(
	timeSeriesCliRemoved,
	'journey-time-series',
	undefined,
);
if (timeSeriesJourney.exported.scene.kind !== 'time-series') {
	throw new Error('time-series browser export changed scene kind.');
}
if (timeSeriesJourney.exported.drawings.drawings.length !== 23) {
	throw new Error('time-series browser journey did not add the segment.');
}
const timeSeriesExportedInput = await writeInput(
	'journey-time-series-exported.json',
	timeSeriesJourney.exported,
);
await assertNodePythonHash(
	'journey-time-series-exported',
	'workspace',
	await hashCanonicalDrawableWorkspace(
		parseDrawableWorkspaceDocument(timeSeriesJourney.exported),
	),
	timeSeriesExportedInput,
);
await assertWorkspaceRenderAgreement(
	'journey-time-series',
	timeSeriesExportedInput,
);

process.stdout.write(
	`DrawableWorkspace cross-language round trip passed; artifacts: ${temporaryDirectory}\n`,
);
