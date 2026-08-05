import { SceneError } from '@baron1996/kline-scene-schema';
import { normalizeDecimalValue } from '@baron1996/kline-scene-schema';

/**
 * 把引擎价格按 Scene 标的精度做十进制舍入。
 * 舍入规则为最接近，恰好半值时远离零；任何负零统一输出正零。
 */
export function normalizePriceValue(
	value: number,
	pricePrecision: number,
	path: string,
): number {
	try {
		return normalizeDecimalValue(value, pricePrecision);
	} catch (error) {
		if (error instanceof RangeError) {
			throw new SceneError(
				'EXPORT_INVALID',
				Number.isInteger(pricePrecision) && pricePrecision >= 0 && pricePrecision <= 16
					? path
					: '/symbol/pricePrecision',
				error.message,
			);
		}
		throw error;
	}
}
