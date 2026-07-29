import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';

import {
	hashCanonicalScene,
	parseChartScene,
	serializeCanonicalScene,
} from '@baron1996/kline-scene-schema';

const execFileAsync = promisify(execFile);
const repositoryDirectory = resolve('.');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'baron-cross-language-'));
const python = process.env.BARON_PYTHON ?? 'python3';
const pythonPath = [
	join(repositoryDirectory, 'python', 'baron-klinecharts', 'src'),
	process.env.PYTHONPATH,
].filter(Boolean).join(delimiter);
const environment = { ...process.env, PYTHONPATH: pythonPath };
const pythonFlow = join(repositoryDirectory, 'tests', 'cross-language', 'python_flow.py');
const cli = join(repositoryDirectory, 'packages', 'cli', 'dist', 'cli.js');
const fixture = join(repositoryDirectory, 'tests', 'fixtures', 'scenes', 'minimal-valid.json');
const m1Fixture = join(
	repositoryDirectory,
	'tests',
	'fixtures',
	'scenes',
	'm1-candle-horizontal-line.json',
);
const mockFixture = join(repositoryDirectory, 'examples', 'vanilla', 'mock-year.scene.json');

async function runPython(arguments_) {
	return execFileAsync(python, [pythonFlow, ...arguments_], { env: environment });
}

async function runCli(arguments_) {
	return execFileAsync(process.execPath, [cli, ...arguments_]);
}

const mockPythonCanonical = join(temporaryDirectory, 'mock-python-canonical.json');
await runPython(['canonical', mockFixture, mockPythonCanonical]);
const mockScene = parseChartScene(JSON.parse(await readFile(mockFixture, 'utf8')));
const mockNodeCanonical = serializeCanonicalScene(mockScene);
if (!Buffer.from(mockNodeCanonical).equals(await readFile(mockPythonCanonical))) {
	throw new Error('TypeScript and Python canonical Mock Scene bytes differ.');
}
const mockNodeHash = await hashCanonicalScene(mockScene);
const mockPythonHash = (await runPython(['hash', mockFixture])).stdout.trim();
if (mockNodeHash !== mockPythonHash) {
	throw new Error(
		`TypeScript and Python Mock Scene hashes differ: ${mockNodeHash} != ${mockPythonHash}`,
	);
}

const m1PythonCanonical = join(temporaryDirectory, 'm1-python-canonical.json');
await runPython(['canonical', m1Fixture, m1PythonCanonical]);
const m1Scene = parseChartScene(JSON.parse(await readFile(m1Fixture, 'utf8')));
const m1NodeCanonical = serializeCanonicalScene(m1Scene);
if (!Buffer.from(m1NodeCanonical).equals(await readFile(m1PythonCanonical))) {
	throw new Error('TypeScript and Python canonical M1 Scene bytes differ.');
}
const m1NodeHash = await hashCanonicalScene(m1Scene);
const m1PythonHash = (await runPython(['hash', m1Fixture])).stdout.trim();
if (m1NodeHash !== m1PythonHash) {
	throw new Error(
		`TypeScript and Python M1 Scene hashes differ: ${m1NodeHash} != ${m1PythonHash}`,
	);
}

const mockCliHtml = join(temporaryDirectory, 'mock-cli.html');
const mockPythonHtml = join(temporaryDirectory, 'mock-python.html');
const mockPythonPng = join(temporaryDirectory, 'mock-python.png');
await runCli(['render', mockFixture, '--format', 'html', '--output', mockCliHtml]);
await runPython(['render', mockFixture, mockPythonHtml, mockPythonPng]);
if (!(await readFile(mockCliHtml)).equals(await readFile(mockPythonHtml))) {
	throw new Error('CLI and Python standalone Mock Scene HTML bytes differ.');
}

const pythonCreated = join(temporaryDirectory, 'python-created.json');
await runPython(['create', fixture, pythonCreated]);

const allOverlays = JSON.parse(
	await readFile(join(repositoryDirectory, 'tests', 'fixtures', 'scenes', 'all-overlays.json'), 'utf8'),
);
const overlayPath = join(temporaryDirectory, 'overlay.json');
await writeFile(overlayPath, JSON.stringify(allOverlays.overlays[7]), 'utf8');
const cliEdited = join(temporaryDirectory, 'cli-edited.json');
await runCli([
	'overlays', 'add', pythonCreated,
	'--overlay', overlayPath,
	'--output', cliEdited,
]);

const browserInputHtml = join(temporaryDirectory, 'browser-input.html');
await runCli([
	'render', cliEdited,
	'--format', 'html',
	'--output', browserInputHtml,
]);

const browser = await chromium.launch({ headless: true });
const browserExported = join(temporaryDirectory, 'browser-exported.json');
try {
	const context = await browser.newContext({
		viewport: { width: 1000, height: 600 },
		deviceScaleFactor: 1,
		locale: 'zh-CN',
		timezoneId: 'Asia/Shanghai',
		offline: true,
		serviceWorkers: 'block',
		reducedMotion: 'reduce',
	});
	try {
		const page = await context.newPage();
		await page.setContent(await readFile(browserInputHtml, 'utf8'), { waitUntil: 'load' });
		await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);
		await page.locator('[data-action="overlay-text"]').fill('跨语言中文标注');
		await page.locator('[data-overlay-type="text"]').click();
		await page.locator('[data-baron-render-root] canvas').nth(1).click({
			position: { x: 430, y: 270 },
		});
		await page.waitForFunction(
			() => window.__BARON_KLINE_SCENE__.exportScene().overlays.length === 2,
		);
		const exported = parseChartScene(
			await page.evaluate(() => window.__BARON_KLINE_SCENE__.exportScene()),
		);
		if (exported.overlays[1]?.text !== '跨语言中文标注') {
			throw new Error('Browser edit did not preserve Chinese Overlay text.');
		}
		await writeFile(browserExported, serializeCanonicalScene(exported));
		await page.evaluate(() => window.__BARON_KLINE_SCENE__.destroy());
	} finally {
		await context.close();
	}
} finally {
	await browser.close();
}

const pythonRoundTrip = join(temporaryDirectory, 'python-roundtrip.json');
await runPython(['roundtrip', browserExported, pythonRoundTrip]);
const nodeCanonical = serializeCanonicalScene(
	JSON.parse(await readFile(browserExported, 'utf8')),
);
const pythonCanonical = await readFile(pythonRoundTrip);
if (!Buffer.from(nodeCanonical).equals(pythonCanonical)) {
	throw new Error('TypeScript and Python canonical Scene bytes differ.');
}
const nodeHash = await hashCanonicalScene(JSON.parse(await readFile(browserExported, 'utf8')));
const pythonHash = (await runPython(['hash', browserExported])).stdout.trim();
if (nodeHash !== pythonHash) {
	throw new Error(`TypeScript and Python Scene hashes differ: ${nodeHash} != ${pythonHash}`);
}

const cliHtml = join(temporaryDirectory, 'cli.html');
const cliPng = join(temporaryDirectory, 'cli.png');
await runCli(['render', browserExported, '--format', 'html', '--output', cliHtml]);
await runCli(['render', browserExported, '--format', 'png', '--output', cliPng]);
const pythonHtml = join(temporaryDirectory, 'python.html');
const pythonPng = join(temporaryDirectory, 'python.png');
await runPython(['render', browserExported, pythonHtml, pythonPng]);

const cliHtmlBytes = await readFile(cliHtml);
if (!cliHtmlBytes.equals(await readFile(pythonHtml))) {
	throw new Error('CLI and Python standalone HTML bytes differ.');
}
if (!(await readFile(cliPng)).equals(await readFile(pythonPng))) {
	throw new Error('CLI and Python PNG bytes differ on the pinned host.');
}
const html = cliHtmlBytes.toString('utf8');
for (const metadata of [
	'name="baron-scene-version" content="1"',
	'name="baron-runtime-version" content="0.1.0"',
	'name="baron-klinecharts-version" content="10.0.0"',
	'name="baron-playwright-version" content="1.61.0"',
]) {
	if (!html.includes(metadata)) {
		throw new Error(`Standalone HTML is missing exact metadata: ${metadata}`);
	}
}

process.stdout.write(
	`Cross-language round trip passed: mock=${mockNodeHash}; m1=${m1NodeHash}; edited=${nodeHash}; artifacts: ${temporaryDirectory}\n`,
);
