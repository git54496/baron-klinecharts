import { describe, expect, it } from 'vitest';

import {
	isTouchPrecisionTap,
	resolveTouchPrecisionContinuationCursor,
	resolveTouchPrecisionCursor,
} from '../src/interaction/touch-precision-drawing.js';

describe('touch precision drawing geometry', () => {
	it('keeps the virtual cursor above and left of the finger', () => {
		expect(resolveTouchPrecisionCursor(
			{ x: 320, y: 420 },
			{ left: 20, top: 60, right: 900, bottom: 560 },
		)).toEqual({ x: 264, y: 316 });
	});

	it('clamps the virtual cursor to the chart main bounds', () => {
		expect(resolveTouchPrecisionCursor(
			{ x: 30, y: 80 },
			{ left: 20, top: 60, right: 900, bottom: 560 },
		)).toEqual({ x: 20, y: 60 });
		expect(resolveTouchPrecisionCursor(
			{ x: 1_200, y: 900 },
			{ left: 20, top: 60, right: 900, bottom: 560 },
		)).toEqual({ x: 900, y: 560 });
	});

	it('continues from the saved cursor instead of snapping to a new touch origin', () => {
		const bounds = { left: 20, top: 60, right: 900, bottom: 560 };
		expect(resolveTouchPrecisionContinuationCursor(
			{ x: 784, y: 436 },
			{ x: 220, y: 540 },
			{ x: 280, y: 480 },
			bounds,
		)).toEqual({ x: 844, y: 376 });
		expect(resolveTouchPrecisionContinuationCursor(
			{ x: 880, y: 80 },
			{ x: 220, y: 540 },
			{ x: 280, y: 480 },
			bounds,
		)).toEqual({ x: 900, y: 60 });
	});

	it('distinguishes a confirming tap from a positioning drag', () => {
		expect(isTouchPrecisionTap({ x: 100, y: 100 }, { x: 104, y: 104 })).toBe(true);
		expect(isTouchPrecisionTap({ x: 100, y: 100 }, { x: 108, y: 100 })).toBe(false);
		expect(isTouchPrecisionTap({ x: 100, y: 100 }, { x: 130, y: 160 })).toBe(false);
	});
});
