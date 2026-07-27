import {
	parseChartScene,
	serializeCanonicalScene,
	type ChartScene,
	type SceneOverlay,
} from '@baron1996/kline-scene-schema';

import { CliError } from '../errors.js';
import {
	assertDistinctInputOutput,
	readJsonFile,
	readSceneFile,
	writeOutputAtomic,
} from '../files.js';

export type CollectionAction = 'list' | 'get' | 'add' | 'replace' | 'remove';

function findOverlay(scene: ChartScene, id: string): SceneOverlay {
	const overlay = scene.overlays.find((candidate) => candidate.id === id);
	if (overlay === undefined) {
		throw new CliError('COLLECTION_ITEM_NOT_FOUND', '/overlays', `Overlay not found: ${id}`);
	}
	return overlay;
}

async function readOverlay(path: string): Promise<SceneOverlay> {
	const value = await readJsonFile(path);
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new CliError('CLI_ARGUMENT_INVALID', path, 'Overlay input must be a JSON object.');
	}
	return value as SceneOverlay;
}

export async function queryOverlays(
	inputPath: string,
	action: 'list' | 'get',
	id?: string,
): Promise<readonly SceneOverlay[] | SceneOverlay> {
	const scene = await readSceneFile(inputPath);
	if (action === 'list') {
		return scene.overlays;
	}
	if (id === undefined) {
		throw new CliError('CLI_ARGUMENT_INVALID', '/arguments/id', '--id is required.');
	}
	return findOverlay(scene, id);
}

export async function mutateOverlays(options: {
	readonly inputPath: string;
	readonly outputPath: string;
	readonly action: 'add' | 'replace' | 'remove';
	readonly id?: string;
	readonly itemPath?: string;
	readonly force: boolean;
}): Promise<void> {
	assertDistinctInputOutput(options.inputPath, options.outputPath);
	const scene = await readSceneFile(options.inputPath);
	let overlays = [...scene.overlays];

	if (options.action === 'remove') {
		if (options.id === undefined) {
			throw new CliError('CLI_ARGUMENT_INVALID', '/arguments/id', '--id is required.');
		}
		findOverlay(scene, options.id);
		overlays = overlays.filter((overlay) => overlay.id !== options.id);
	} else {
		if (options.itemPath === undefined) {
			throw new CliError('CLI_ARGUMENT_INVALID', '/arguments/overlay', '--overlay is required.');
		}
		const overlay = await readOverlay(options.itemPath);
		const existingIndex = overlays.findIndex((candidate) => candidate.id === overlay.id);
		if (options.action === 'add') {
			if (existingIndex >= 0) {
				throw new CliError('COLLECTION_ITEM_EXISTS', '/overlays', `Overlay already exists: ${overlay.id}`);
			}
			overlays.push(overlay);
		} else {
			if (options.id !== undefined && options.id !== overlay.id) {
				throw new CliError(
					'CLI_ARGUMENT_INVALID',
					'/arguments/id',
					'--id must match the replacement Overlay id.',
				);
			}
			if (existingIndex < 0) {
				throw new CliError('COLLECTION_ITEM_NOT_FOUND', '/overlays', `Overlay not found: ${overlay.id}`);
			}
			overlays[existingIndex] = overlay;
		}
	}

	const output = parseChartScene({ ...scene, overlays });
	await writeOutputAtomic(options.outputPath, serializeCanonicalScene(output), options.force);
}
