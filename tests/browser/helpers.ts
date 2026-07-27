import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Page } from '@playwright/test';

import type { ChartScene } from '@baron1996/kline-scene-schema';

export async function loadScene(name: string): Promise<ChartScene> {
	return JSON.parse(
		await readFile(resolve('tests', 'fixtures', 'scenes', name), 'utf8'),
	) as ChartScene;
}

export async function createSourceRuntime(
	page: Page,
	scene: ChartScene,
	withToolbar = true,
): Promise<void> {
	await page.goto('/packages/web-runtime/test/fixture.html');
	await page.evaluate(async ({ value, toolbar }) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
		} = await import('/packages/web-runtime/src/index.ts');
		const events: unknown[] = [];
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			value,
			{ onEvent: (event) => events.push(event) },
		);
		if (toolbar) {
			createStandardToolbar(
				document.querySelector<HTMLElement>('#toolbar')!,
				runtime,
			);
		}
		Object.assign(window, {
			__baronTestRuntime: runtime,
			__baronTestEvents: events,
		});
	}, { value: scene, toolbar: withToolbar });
}
