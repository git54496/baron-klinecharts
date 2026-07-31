import { SceneError } from '@baron1996/kline-scene-schema';

interface DecimalParts {
	readonly digits: bigint;
	readonly exponent: number;
}

function toDecimalParts(value: number): DecimalParts {
	const [coefficient = '', exponentText] = value.toString().toLowerCase().split('e');
	const [integer = '', fraction = ''] = coefficient.split('.');
	return {
		digits: BigInt(`${integer}${fraction}`),
		exponent: Number(exponentText ?? 0) - fraction.length,
	};
}

function toDecimalNumber(value: bigint, precision: number, negative: boolean): number {
	const digits = value.toString().padStart(precision + 1, '0');
	const unsigned = precision === 0
		? digits
		: `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
	return Number(`${negative ? '-' : ''}${unsigned}`);
}

/**
 * 把引擎价格按 Scene 标的精度做十进制舍入。
 * 舍入规则为最接近，恰好半值时远离零；任何负零统一输出正零。
 */
export function normalizePriceValue(
	value: number,
	pricePrecision: number,
	path: string,
): number {
	if (!Number.isFinite(value)) {
		throw new SceneError('EXPORT_INVALID', path, 'KLineCharts returned a non-finite price value.');
	}
	if (
		!Number.isInteger(pricePrecision) ||
		pricePrecision < 0 ||
		pricePrecision > 16
	) {
		throw new SceneError(
			'EXPORT_INVALID',
			'/symbol/pricePrecision',
			'Scene pricePrecision must be an integer from 0 through 16.',
		);
	}

	const negative = value < 0;
	const { digits, exponent } = toDecimalParts(Math.abs(value));
	const scaledExponent = exponent + pricePrecision;
	let rounded: bigint;
	if (scaledExponent >= 0) {
		rounded = digits * (10n ** BigInt(scaledExponent));
	} else {
		const divisor = 10n ** BigInt(-scaledExponent);
		const quotient = digits / divisor;
		const remainder = digits % divisor;
		rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);
	}

	const normalized = toDecimalNumber(rounded, pricePrecision, negative);
	if (!Number.isFinite(normalized)) {
		throw new SceneError('EXPORT_INVALID', path, 'Normalized price value is not finite.');
	}
	return Object.is(normalized, -0) ? 0 : normalized;
}
