import type { AxisCreateTicksParams, AxisTick } from 'klinecharts';

const MIN_TICK_SPACING = 48;

/**
 * Preserve the standard positive logarithm down to one display quantum, then
 * bridge linearly through zero and continue logarithmically for negatives.
 */
export function signedLogValue(value: number, linearThreshold = 1): number {
	const boundary = Math.log10(linearThreshold);
	if (value >= linearThreshold) return Math.log10(value);
	if (value > -linearThreshold) return boundary + value / linearThreshold - 1;
	return boundary - 2 - Math.log10(Math.abs(value) / linearThreshold);
}

/** Exact inverse of signedLogValue, including zero and negative prices. */
export function signedLogPrice(value: number, linearThreshold = 1): number {
	const boundary = Math.log10(linearThreshold);
	if (value >= boundary) return 10 ** value;
	if (value > boundary - 2) return linearThreshold * (value - boundary + 1);
	return -linearThreshold * 10 ** (boundary - 2 - value);
}

/** Choose density in log space, independent of the translated price bounds. */
function logStep(span: number, height: number, textHeight: number): number {
	const target = span * Math.max(MIN_TICK_SPACING, textHeight * 3) / height;
	const magnitude = 10 ** Math.floor(Math.log10(target));
	const normalized = target / magnitude;
	// Tolerate floating-point noise at a density boundary across repeated pans.
	const factor = [1, 2, 2.5, 5, 10].find((value) => value >= normalized * (1 - 1e-10))!;
	return Number((factor * magnitude).toPrecision(12));
}

function priceText(value: number, realValue: number, step: number, linearThreshold: number): string {
	// Retain the usual two decimals; close ticks around zero need enough digits
	// to avoid adjacent labels becoming identical after rounding.
	const difference = Math.min(
		Math.abs(value - signedLogPrice(realValue - step, linearThreshold)),
		Math.abs(signedLogPrice(realValue + step, linearThreshold) - value),
	);
	const precision = Math.max(2, 1 - Math.floor(Math.log10(difference)));
	return precision > 12 || Math.abs(value) >= 1e12
		? value.toExponential(6)
		: value.toFixed(precision);
}

/** Signed candle prices: fixed extended-log lattice, shared by ticks and grid lines. */
export function createLogPriceTicks(
	{ range, bounding, defaultTicks }: AxisCreateTicksParams,
	reverse: boolean,
	presentation: {
		textHeight?: number;
		formatText?: (text: string) => string;
		linearThreshold?: number;
	} = {},
): AxisTick[] {
	const { realFrom, realTo, realRange } = range;
	const { height } = bounding;
	if (!(range.to > range.from && realRange > 0 && height > 0)
		|| ![realFrom, realTo, realRange, height].every(Number.isFinite)) {
		return defaultTicks;
	}
	const textHeight = presentation.textHeight ?? 12;
	const linearThreshold = presentation.linearThreshold ?? 1;
	if (!(linearThreshold > 0 && Number.isFinite(linearThreshold))) return defaultTicks;
	const step = logStep(realRange, height, textHeight);
	if (!(step > 0 && Number.isFinite(step))) return defaultTicks;
	const first = Math.ceil(realFrom / step);
	const last = Math.floor(realTo / step);
	if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return defaultTicks;
	const ticks: AxisTick[] = [];
	// Anchor to extended-log(price)=0, not the viewport edge. Compute each tick from
	// its integer index so newly exposed ticks extend the same price sequence.
	for (let index = first; index <= last && ticks.length < 1000; index++) {
		const logValue = Number((index * step).toPrecision(14));
		const value = signedLogPrice(logValue, linearThreshold);
		const fraction = (logValue - realFrom) / realRange;
		const coord = Math.round(height * (reverse ? fraction : 1 - fraction));
		if (coord <= textHeight || coord >= height - textHeight) continue;
		if (!Number.isFinite(value)) continue;
		const text = priceText(value, logValue, step, linearThreshold);
		ticks.push({ value, coord, text: presentation.formatText?.(text) ?? text });
	}
	return ticks;
}
