import { describe, expect, it, vi } from 'vitest';
import { scaledTextFigure, textOverlay } from '../src/extensions/text.js';
import { textExtendData, textMetadata } from '../src/drawing/text-box.js';

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

describe('text handle ownership', () => {
	for (const [nativeHandles, locked, count] of [[false, false, 0], [true, false, 4], [true, true, 0]] as const) {
		it(`paints ${count} canvas handles when nativeHandles=${nativeHandles}, locked=${locked}`, () => {
			const create = textOverlay.createPointFigures!;
			const figures = create({
				coordinates: [{ x: 100, y: 100 }], bounding: { width: 1000 },
				chart: {
					getDataList: () => [{ timestamp: 0 }, { timestamp: 7200000 }],
					getPeriod: () => ({ type: 'hour', span: 2 }),
					convertToPixel: (point: { dataIndex: number; value: number }) => ({ x: 100 + point.dataIndex * 120, y: point.value }),
				},
				overlay: {
					paneId: 'candle', points: [{ timestamp: 0, value: 100 }], lock: locked,
					extendData: textExtendData({ type: 'text', text: '文字', metadata: textMetadata({}, { type: 'hour', span: 2 }, { end: { timestamp: 7200000, value: 140 }, width: 120, height: 40 }) }, true, nativeHandles),
				},
			} as unknown as Parameters<typeof create>[0]);
			expect(Array.isArray(figures)).toBe(true);
			expect((figures as Array<{ type: string }>).filter(figure => figure.type === 'circle')).toHaveLength(count);
		});
	}
});
