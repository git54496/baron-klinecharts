import type { ChartScene } from '@baron1996/kline-scene-schema';
import { SceneError } from '@baron1996/kline-scene-schema';
import type { Chart } from 'klinecharts';

import { toKLineChartsOptions } from './conversion/chart-options.js';
import { createStaticDataLoader } from './static-data-loader.js';
import {
	KLINECHARTS_ENGINE_VERSION,
	KLINECHARTS_RUNTIME_VERSION,
	SUPPORTED_KLINECHARTS_RUNTIME_VERSIONS,
} from './version.js';

export type KLineChartsModule = typeof import('klinecharts');

export interface EngineHandle {
	readonly chart: Chart;
	readonly module: KLineChartsModule;
}

function assertRuntimeIdentity(scene: ChartScene, actualEngineVersion: string): void {
	if (
		scene.runtime.engine !== 'klinecharts' ||
		scene.runtime.engineVersion !== KLINECHARTS_ENGINE_VERSION ||
		actualEngineVersion !== KLINECHARTS_ENGINE_VERSION ||
		!SUPPORTED_KLINECHARTS_RUNTIME_VERSIONS.includes(
			scene.runtime.runtimeVersion as (typeof SUPPORTED_KLINECHARTS_RUNTIME_VERSIONS)[number],
		)
	) {
		throw new SceneError(
			'ENGINE_VERSION_MISMATCH',
			'/runtime',
			`Expected klinecharts ${KLINECHARTS_ENGINE_VERSION} and a supported Runtime through ${KLINECHARTS_RUNTIME_VERSION}; received engine ${actualEngineVersion}.`,
		);
	}
}

/** 按固定顺序创建并初始化唯一的 KLineCharts 引擎。 */
export async function createEngine(
	container: HTMLElement,
	scene: ChartScene,
): Promise<EngineHandle> {
	const engine = await import('klinecharts');
	assertRuntimeIdentity(scene, engine.version());
	const chart = engine.init(container, toKLineChartsOptions(scene.chart));
	if (chart === null) {
		throw new SceneError(
			'RUNTIME_INIT_FAILED',
			'/',
			'KLineCharts returned null while initializing the chart container.',
		);
	}
	// KLineCharts 生成的交互根节点必须独占图表区域内的触摸手势。
	const engineRoot = container.firstElementChild;
	if (!(engineRoot instanceof HTMLElement)) {
		engine.dispose(container);
		throw new SceneError(
			'RUNTIME_INIT_FAILED',
			'/',
			'KLineCharts did not create an interactive chart root.',
		);
	}
	engineRoot.style.touchAction = 'none';
	chart.setSymbol({
		ticker: scene.symbol.ticker,
		pricePrecision: scene.symbol.pricePrecision,
		volumePrecision: scene.symbol.volumePrecision,
		...(scene.symbol.name === undefined ? {} : { name: scene.symbol.name }),
	});
	chart.setPeriod(structuredClone(scene.period));
	chart.setDataLoader(createStaticDataLoader(scene.data));
	return { chart, module: engine };
}
