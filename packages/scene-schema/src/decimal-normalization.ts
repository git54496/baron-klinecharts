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
 * 仓库唯一精确十进制规范化核心：最接近、恰好半值时远离零，负零统一转正零。
 * 非法输入抛 RangeError，由调用方映射到各自稳定错误类型。
 */
export function normalizeDecimalValue(value: number, precision: number): number {
	if (!Number.isFinite(value)) {
		throw new RangeError('Decimal value must be finite.');
	}
	if (
		!Number.isInteger(precision) ||
		precision < 0 ||
		precision > 16
	) {
		throw new RangeError('Precision must be an integer from 0 through 16.');
	}

	const negative = value < 0;
	const { digits, exponent } = toDecimalParts(Math.abs(value));
	const scaledExponent = exponent + precision;
	let rounded: bigint;
	if (scaledExponent >= 0) {
		rounded = digits * (10n ** BigInt(scaledExponent));
	} else {
		const divisor = 10n ** BigInt(-scaledExponent);
		const quotient = digits / divisor;
		const remainder = digits % divisor;
		rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);
	}

	const normalized = toDecimalNumber(rounded, precision, negative);
	if (!Number.isFinite(normalized)) {
		throw new RangeError('Normalized decimal value is not finite.');
	}
	return Object.is(normalized, -0) ? 0 : normalized;
}
