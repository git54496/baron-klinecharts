import {
	parseChartScene,
	serializeCanonicalScene,
	type ChartScene,
	type SceneIndicator,
} from '@baron1996/kline-scene-schema';

import { CliError } from '../errors.js';
import {
	assertDistinctInputOutput,
	readJsonFile,
	readSceneFile,
	writeOutputAtomic,
} from '../files.js';

interface IndicatorLocation {
	readonly paneIndex: number;
	readonly indicatorIndex: number;
	readonly indicator: SceneIndicator;
}

function findIndicator(scene: ChartScene, id: string): IndicatorLocation {
	for (let paneIndex = 0; paneIndex < scene.panes.length; paneIndex++) {
		const pane = scene.panes[paneIndex];
		const indicatorIndex = pane?.indicators.findIndex((candidate) => candidate.id === id) ?? -1;
		if (pane !== undefined && indicatorIndex >= 0) {
			const indicator = pane.indicators[indicatorIndex];
			if (indicator !== undefined) {
				return { paneIndex, indicatorIndex, indicator };
			}
		}
	}
	throw new CliError('COLLECTION_ITEM_NOT_FOUND', '/panes', `Indicator not found: ${id}`);
}

async function readIndicator(path: string): Promise<SceneIndicator> {
	const value = await readJsonFile(path);
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new CliError('CLI_ARGUMENT_INVALID', path, 'Indicator input must be a JSON object.');
	}
	return value as SceneIndicator;
}

export async function queryIndicators(
	inputPath: string,
	action: 'list' | 'get',
	id?: string,
): Promise<readonly SceneIndicator[] | SceneIndicator> {
	const scene = await readSceneFile(inputPath);
	if (action === 'list') {
		return scene.panes.flatMap((pane) => pane.indicators);
	}
	if (id === undefined) {
		throw new CliError('CLI_ARGUMENT_INVALID', '/arguments/id', '--id is required.');
	}
	return findIndicator(scene, id).indicator;
}

export async function mutateIndicators(options: {
	readonly inputPath: string;
	readonly outputPath: string;
	readonly action: 'add' | 'replace' | 'remove';
	readonly id?: string;
	readonly itemPath?: string;
	readonly force: boolean;
}): Promise<void> {
	assertDistinctInputOutput(options.inputPath, options.outputPath);
	const scene = await readSceneFile(options.inputPath);
	const panes = scene.panes.map((pane) => ({
		...pane,
		indicators: [...pane.indicators],
	}));

	if (options.action === 'remove') {
		if (options.id === undefined) {
			throw new CliError('CLI_ARGUMENT_INVALID', '/arguments/id', '--id is required.');
		}
		const location = findIndicator(scene, options.id);
		panes[location.paneIndex]?.indicators.splice(location.indicatorIndex, 1);
	} else {
		if (options.itemPath === undefined) {
			throw new CliError('CLI_ARGUMENT_INVALID', '/arguments/indicator', '--indicator is required.');
		}
		const indicator = await readIndicator(options.itemPath);
		if (options.action === 'add') {
			try {
				findIndicator(scene, indicator.id);
				throw new CliError('COLLECTION_ITEM_EXISTS', '/panes', `Indicator already exists: ${indicator.id}`);
			} catch (error) {
				if (!(error instanceof CliError) || error.code !== 'COLLECTION_ITEM_NOT_FOUND') {
					throw error;
				}
			}
			const paneIndex = panes.findIndex((pane) => pane.id === indicator.paneId);
			if (paneIndex < 0) {
				throw new CliError('COLLECTION_ITEM_NOT_FOUND', '/panes', `Pane not found: ${indicator.paneId}`);
			}
			panes[paneIndex]?.indicators.push(indicator);
		} else {
			const location = findIndicator(scene, options.id ?? indicator.id);
			if (options.id !== undefined && options.id !== indicator.id) {
				throw new CliError(
					'CLI_ARGUMENT_INVALID',
					'/arguments/id',
					'--id must match the replacement Indicator id.',
				);
			}
			if (scene.panes[location.paneIndex]?.id !== indicator.paneId) {
				throw new CliError(
					'CLI_ARGUMENT_INVALID',
					'/arguments/indicator',
					'Replacement Indicator cannot move between Panes.',
				);
			}
			panes[location.paneIndex]!.indicators[location.indicatorIndex] = indicator;
		}
	}

	const output = parseChartScene({ ...scene, panes });
	await writeOutputAtomic(options.outputPath, serializeCanonicalScene(output), options.force);
}
