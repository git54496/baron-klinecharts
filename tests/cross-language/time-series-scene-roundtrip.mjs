import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
	hashCanonicalTimeSeriesScene,
	parseTimeSeriesScene,
	serializeCanonicalTimeSeriesScene,
} from '@baron1996/kline-scene-schema';

const execFileAsync = promisify(execFile);
const repositoryDirectory = resolve('.');
const temporaryDirectory = await mkdtemp(
	join(tmpdir(), 'baron-time-series-cross-language-'),
);
const python = process.env.BARON_PYTHON ?? 'python3';
const pythonPath = [
	join(repositoryDirectory, 'python', 'baron-klinecharts', 'src'),
	process.env.PYTHONPATH,
].filter(Boolean).join(delimiter);
const fixture = join(
	repositoryDirectory,
	'tests',
	'fixtures',
	'time-series',
	'minimal-valid.json',
);
const pythonFlow = join(
	repositoryDirectory,
	'tests',
	'cross-language',
	'time_series_python_flow.py',
);

async function runPython(arguments_) {
	return execFileAsync(python, [pythonFlow, ...arguments_], {
		env: { ...process.env, PYTHONPATH: pythonPath },
	});
}

const scene = parseTimeSeriesScene(JSON.parse(await readFile(fixture, 'utf8')));
const nodeBytes = serializeCanonicalTimeSeriesScene(scene);
const pythonCanonical = join(temporaryDirectory, 'python-canonical.json');
await runPython(['canonical', fixture, pythonCanonical]);
if (!Buffer.from(nodeBytes).equals(await readFile(pythonCanonical))) {
	throw new Error('TypeScript and Python canonical TimeSeriesScene bytes differ.');
}

const nodeHash = await hashCanonicalTimeSeriesScene(scene);
const pythonHash = (await runPython(['hash', fixture])).stdout.trim();
if (nodeHash !== pythonHash) {
	throw new Error(
		`TypeScript and Python TimeSeriesScene hashes differ: ${nodeHash} != ${pythonHash}.`,
	);
}

const pythonRoundTrip = join(temporaryDirectory, 'python-roundtrip.json');
await runPython(['roundtrip', fixture, pythonRoundTrip]);
if (!Buffer.from(nodeBytes).equals(await readFile(pythonRoundTrip))) {
	throw new Error('Python TimeSeriesScene round trip changed canonical bytes.');
}

const largeNumberScene = structuredClone(scene);
largeNumberScene.data[0].values['series-a'] = 1e20;
largeNumberScene.metadata = { large: 1e20, exponent: 1.25e-7 };
const largeNumberInput = join(temporaryDirectory, 'large-number.json');
await writeFile(largeNumberInput, JSON.stringify(largeNumberScene));
const largeNumberNodeBytes = serializeCanonicalTimeSeriesScene(
	parseTimeSeriesScene(largeNumberScene),
);
const largeNumberPythonCanonical = join(
	temporaryDirectory,
	'large-number-python-canonical.json',
);
await runPython(['canonical', largeNumberInput, largeNumberPythonCanonical]);
if (!Buffer.from(largeNumberNodeBytes).equals(await readFile(largeNumberPythonCanonical))) {
	throw new Error('Large finite numbers differ between TypeScript and Python.');
}

function nodeError(value) {
	try {
		parseTimeSeriesScene(value);
	} catch (error) {
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
	throw new Error('Expected invalid TimeSeriesScene.');
}

async function assertCrossLanguageError(name, value) {
	const input = join(temporaryDirectory, `${name}.json`);
	await writeFile(input, JSON.stringify(value));
	const pythonError = JSON.parse(
		(await runPython(['validate-error', input])).stdout,
	);
	const expected = nodeError(value);
	if (JSON.stringify(pythonError) !== JSON.stringify(expected)) {
		throw new Error(
			`${name} error differs: ${JSON.stringify(expected)} != ${JSON.stringify(pythonError)}.`,
		);
	}
}

const missingValue = structuredClone(scene);
missingValue.series.push({ ...missingValue.series[0], id: 'series-b' });
await assertCrossLanguageError('missing-series-value', missingValue);

const missingProperty = structuredClone(scene);
delete missingProperty.metadata;
await assertCrossLanguageError('missing-required-property', missingProperty);

const missingProperties = structuredClone(scene);
delete missingProperties.render;
delete missingProperties.metadata;
await assertCrossLanguageError('missing-required-properties', missingProperties);

const additionalProperty = structuredClone(scene);
additionalProperty['bad/key'] = true;
await assertCrossLanguageError('additional-property', additionalProperty);

const additionalProperties = structuredClone(scene);
additionalProperties['z/key'] = true;
additionalProperties['a~key'] = false;
await assertCrossLanguageError('additional-properties', additionalProperties);

process.stdout.write(
	`TimeSeriesScene cross-language round trip passed: ${nodeHash}; artifacts: ${temporaryDirectory}\n`,
);
