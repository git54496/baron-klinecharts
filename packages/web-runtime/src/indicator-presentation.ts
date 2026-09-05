import type { SceneIndicator } from '@baron1996/kline-scene-schema';

import type { AddIndicatorOptions } from './types.js';

export const MAIN_PANE_INDICATOR_PRESETS = [
	{ name: 'MA', label: 'MA', calcParams: [5, 10, 30, 60] },
	{ name: 'EMA', label: 'EMA', calcParams: [6, 12, 20] },
	{ name: 'SMA', label: 'SMA', calcParams: [12, 2] },
	{ name: 'BOLL', label: 'BOLL', calcParams: [20, 2] },
	{ name: 'SAR', label: 'SAR', calcParams: [2, 2, 20] },
	{ name: 'BBI', label: 'BBI', calcParams: [3, 6, 12, 24] },
] as const satisfies readonly {
	readonly name: SceneIndicator['name'];
	readonly label: string;
	readonly calcParams: readonly number[];
}[];

const DEFAULT_INDICATOR_LINE_COLORS = [
	'rgba(41, 98, 255, 1)',
	'rgba(245, 158, 11, 1)',
	'rgba(16, 185, 129, 1)',
	'rgba(239, 68, 68, 1)',
	'rgba(139, 92, 246, 1)',
] as const;

export function defaultIndicatorStyles(
	name: SceneIndicator['name'],
	calcParams: readonly number[],
): SceneIndicator['styles'] {
	const lines = calcParams.map((_param, index) => ({
		color:
			DEFAULT_INDICATOR_LINE_COLORS[
				index % DEFAULT_INDICATOR_LINE_COLORS.length
			]!,
		size: 1,
		style: 'solid' as const,
	}));
	if (name === 'VOL') {
		return {
			lines,
			bars: [
				{
					upColor: 'rgba(239, 83, 80, 1)',
					downColor: 'rgba(38, 166, 154, 1)',
					noChangeColor: 'rgba(88, 88, 88, 1)',
				},
			],
			circles: [],
		};
	}
	return { lines, bars: [], circles: [] };
}

export function createSceneIndicator(
	options: AddIndicatorOptions,
	target: { readonly paneId: string; readonly yAxisId: string },
	id: string,
): SceneIndicator {
	return {
		id,
		name: options.name,
		paneId: target.paneId,
		yAxisId: target.yAxisId,
		calcParams: [...options.calcParams],
		precision: options.precision ?? 2,
		visible: options.visible ?? true,
		zLevel: options.zLevel ?? 0,
		styles:
			options.styles ??
			defaultIndicatorStyles(options.name, options.calcParams),
	};
}

export function isMainPaneIndicatorName(name: SceneIndicator['name']): boolean {
	return MAIN_PANE_INDICATOR_PRESETS.some((preset) => preset.name === name);
}
