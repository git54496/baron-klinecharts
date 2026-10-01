import { describe, expect, it, vi } from 'vitest';
import { scaledTextFigure } from '../src/extensions/text.js';

describe('scaled text proportions', () => {
	for (const [width, height, scale] of [[168, 146, 2], [808, 20, 1], [48, 34, 0.5]]) {
		it(`fits a ${width} × ${height} box without stretching either glyph axis`, () => {
			const ctx = {
				save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillText: vi.fn(),
				measureText: vi.fn(() => ({ width: 80 })),
			};
			scaledTextFigure.draw!(ctx as unknown as CanvasRenderingContext2D, {
				x: 100, y: 120, width, height, text: '文字', label: '2H', collapsed: false, selected: true, limit: 1000,
			}, { size: 10 });
			expect(ctx.fillRect).toHaveBeenCalledWith(100, 120, width, height);
			expect(ctx.scale).toHaveBeenCalledExactlyOnceWith(scale, scale);
			expect(ctx.fillText).toHaveBeenCalledExactlyOnceWith('2H 文字', 0, 0);
			expect(ctx.restore).toHaveBeenCalledOnce();
		});
	}
});
