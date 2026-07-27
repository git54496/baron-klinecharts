import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseChartScene } from '@baron1996/kline-scene-schema';

const GENERATOR_VERSION = '1';
const MOCK_SEED = 0x19960423;
const MOCK_BAR_COUNT = 250;
const END_TIMESTAMP = Date.UTC(2026, 6, 24);
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const outputUrl = new URL('../examples/vanilla/mock-year.scene.json', import.meta.url);
const baseScene = JSON.parse(
	readFileSync(
		new URL('../tests/fixtures/scenes/minimal-valid.json', import.meta.url),
		'utf8',
	),
);

function createIntegerRandom(seed) {
	let state = seed >>> 0;
	return (upperBound) => {
		if (!Number.isSafeInteger(upperBound) || upperBound <= 0) {
			throw new RangeError('Random upper bound must be a positive safe integer.');
		}
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) % upperBound;
	};
}

function collectWeekdayTimestamps() {
	const timestamps = [];
	let timestamp = END_TIMESTAMP;
	while (timestamps.length < MOCK_BAR_COUNT) {
		const day = new Date(timestamp).getUTCDay();
		if (day !== 0 && day !== 6) {
			timestamps.push(timestamp);
		}
		timestamp -= DAY_IN_MILLISECONDS;
	}
	return timestamps.reverse();
}

function centsToPrice(cents) {
	return cents / 100;
}

function generateBars() {
	const randomInteger = createIntegerRandom(MOCK_SEED);
	let previousClose = 12650;

	return collectWeekdayTimestamps().map((timestamp) => {
		const open = Math.max(100, previousClose + randomInteger(51) - 25);
		const close = Math.max(100, open + randomInteger(91) - 45);
		const high = Math.max(open, close) + 5 + randomInteger(35);
		const low = Math.max(1, Math.min(open, close) - 5 - randomInteger(35));
		const volume = 500_000 + randomInteger(4_500_001);
		const turnover = Math.round(volume * ((open + close) / 2) / 100);
		previousClose = close;

		return {
			timestamp,
			open: centsToPrice(open),
			high: centsToPrice(high),
			low: centsToPrice(low),
			close: centsToPrice(close),
			volume,
			turnover,
		};
	});
}

export function generateMockScene() {
	const data = generateBars();
	return parseChartScene({
		...structuredClone(baseScene),
		symbol: {
			ticker: 'MOCK.CN',
			name: '确定性模拟行情',
			pricePrecision: 2,
			volumePrecision: 0,
		},
		data,
		overlays: [],
		viewport: {
			...baseScene.viewport,
			anchorTimestamp: data.at(-1)?.timestamp,
		},
		metadata: {
			source: 'deterministic-mock',
			generatorVersion: GENERATOR_VERSION,
			seed: MOCK_SEED,
			endDate: '2026-07-24',
		},
	});
}

export function serializeMockScene() {
	return `${JSON.stringify(generateMockScene(), null, 2)}\n`;
}

function parseMode(arguments_) {
	if (arguments_.length !== 1 || !['--write', '--check'].includes(arguments_[0])) {
		throw new Error('Usage: node tools/generate-mock-scene.mjs <--write|--check>');
	}
	return arguments_[0];
}

async function run() {
	const mode = parseMode(process.argv.slice(2));
	const generated = serializeMockScene();

	if (mode === '--write') {
		await writeFile(outputUrl, generated, 'utf8');
		process.stdout.write(`Wrote ${outputUrl.pathname}\n`);
		return;
	}

	let committed;
	try {
		committed = await readFile(outputUrl, 'utf8');
	} catch (error) {
		throw new Error(
			`Mock scene is missing or unreadable. Run npm run generate:mock. ${String(error)}`,
		);
	}
	if (committed !== generated) {
		throw new Error('Mock scene is stale. Run npm run generate:mock and commit the result.');
	}
	process.stdout.write('Mock scene matches the deterministic generator.\n');
}

const invokedUrl = process.argv[1] === undefined
	? undefined
	: pathToFileURL(resolve(process.argv[1])).href;
if (invokedUrl === import.meta.url) {
	await run();
}
