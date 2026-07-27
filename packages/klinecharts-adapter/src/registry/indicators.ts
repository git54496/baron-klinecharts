import type { SceneIndicator } from '@baron1996/kline-scene-schema';

export const SUPPORTED_INDICATORS = [
	'MA',
	'EMA',
	'SMA',
	'BBI',
	'VOL',
	'MACD',
	'BOLL',
	'KDJ',
	'RSI',
	'BIAS',
	'BRAR',
	'CCI',
	'DMI',
	'CR',
	'PSY',
	'DMA',
	'TRIX',
	'OBV',
	'VR',
	'WR',
	'MTM',
	'EMV',
	'SAR',
	'AO',
	'ROC',
	'PVT',
	'AVP',
] as const satisfies readonly SceneIndicator['name'][];

const supported = new Set<SceneIndicator['name']>(SUPPORTED_INDICATORS);

export function isSupportedIndicator(
	name: SceneIndicator['name'],
): name is (typeof SUPPORTED_INDICATORS)[number] {
	return supported.has(name);
}
