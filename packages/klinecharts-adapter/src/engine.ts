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
	/** 显式复位引擎点击仲裁状态；每次绘制开始前调用，避免快速连续绘制的首击被吞。 */
	readonly resetClickArbitration: () => void;
}

/**
 * klinecharts 10.0.0 的点击仲裁状态（_clickCount/_clickTimeoutId/_clickCoordinate）
 * 保存在 ChartImp._chartEvent._event（EventHandlerImp）私有链上，引擎未提供任何
 * 公开复位 API；这里只读取其内部 _resetClickTimeout，并由 KLINECHARTS_ENGINE_VERSION
 * 运行时断言保护。若引擎私有结构变化，初始化将显式失败而非静默降级。
 */
interface EngineClickArbitrationInternals {
	readonly _chartEvent?: {
		readonly _event?: {
			readonly _resetClickTimeout?: () => void;
		};
	};
}

function resolveClickArbitrationReset(chart: Chart): () => void {
	const eventHandler = (chart as unknown as EngineClickArbitrationInternals)
		._chartEvent?._event;
	const reset = eventHandler?._resetClickTimeout;
	if (eventHandler === undefined || typeof reset !== 'function') {
		throw new SceneError(
			'RUNTIME_INIT_FAILED',
			'/runtime',
			`KLineCharts ${KLINECHARTS_ENGINE_VERSION} 内部点击仲裁复位钩子不可用；引擎私有结构可能已变化。`,
		);
	}
	return reset.bind(eventHandler);
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
	options?: { readonly displayTimezone?: string },
): Promise<EngineHandle> {
	const engine = await import('klinecharts');
	assertRuntimeIdentity(scene, engine.version());
	const chart = engine.init(
		container,
		toKLineChartsOptions(scene.chart, options?.displayTimezone),
	);
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
	return {
		chart,
		module: engine,
		resetClickArbitration: resolveClickArbitrationReset(chart),
	};
}
