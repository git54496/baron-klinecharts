import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ChartScene } from '@baron1996/kline-scene-schema';

const fixtureDirectory = join(
	fileURLToPath(new URL('.', import.meta.url)),
	'..',
	'..',
	'..',
	'tests',
	'fixtures',
	'scenes',
);

export function loadScene(name: string): ChartScene {
	return JSON.parse(readFileSync(join(fixtureDirectory, name), 'utf8')) as ChartScene;
}
