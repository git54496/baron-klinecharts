import type { AxisCreateTicksParams, AxisTick } from 'klinecharts';

const MIN_TICK_SPACING = 48;

/** Choose density in log space, independent of the translated price bounds. */
function logStep(span: number, height: number, textHeight: number): number {
	const target = span * Math.max(MIN_TICK_SPACING, textHeight * 3) / height;
	const magnitude = 10 ** Math.floor(Math.log10(target));
	const normalized = target / magnitude;
	// Tolerate floating-point noise at a density boundary across repeated pans.
	const factor = [1, 2, 2.5, 5, 10].find((value) => value >= normalized * (1 - 1e-10))!;
	return Number((factor * magnitude).toPrecision(12));
}

function priceText(value: number, step: number): string {
	// Retain the usual two decimals; tiny prices/close ticks need enough digits
	// to avoid adjacent labels becoming identical after rounding.
	const difference = value * Math.expm1(step * Math.LN10);
	const precision = Math.max(2, 1 - Math.floor(Math.log10(difference)));
	return precision > 12 || value >= 1e12
		? value.toExponential(6)
		: value.toFixed(precision);
}

/** Positive candle prices: fixed log lattice, shared by ticks and grid lines. */
export function createLogPriceTicks(
	{ range, bounding, defaultTicks }: AxisCreateTicksParams,
	reverse: boolean,
	presentation: { textHeight?: number; formatText?: (text: string) => string } = {},
): AxisTick[] {
	const { realFrom, realTo, realRange } = range;
	const { height } = bounding;
	if (!(range.from > 0 && range.to > range.from && realRange > 0 && height > 0)
		|| ![realFrom, realTo, realRange, height].every(Number.isFinite)) {
		return defaultTicks;
	}
	const textHeight = presentation.textHeight ?? 12;
	const step = logStep(realRange, height, textHeight);
	if (!(step > 0 && Number.isFinite(step))) return defaultTicks;
	const first = Math.ceil(realFrom / step);
	const last = Math.floor(realTo / step);
	if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return defaultTicks;
	const ticks: AxisTick[] = [];
	// Anchor to log10(price)=0, not the viewport edge. Compute each tick from
	// its integer index so newly exposed ticks extend the same price sequence.
	for (let index = first; index <= last && ticks.length < 1000; index++) {
		const logValue = Number((index * step).toPrecision(14));
		const value = 10 ** logValue;
		const fraction = (logValue - realFrom) / realRange;
		const coord = Math.round(height * (reverse ? fraction : 1 - fraction));
		if (coord <= textHeight || coord >= height - textHeight) continue;
		if (!(value > 0 && Number.isFinite(value))) continue;
		const text = priceText(value, step);
		ticks.push({ value, coord, text: presentation.formatText?.(text) ?? text });
	}
	return ticks;
}
