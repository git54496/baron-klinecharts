import type { registerOverlay } from 'klinecharts';

type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];

/** 项目自有矩形标注，仅使用 KLineCharts 官方 Figure API。 */
export const rectangleOverlay: KLineOverlayTemplate = {
	name: 'rectangle',
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates }) => {
		if (coordinates.length !== 2) {
			return [];
		}
		const [start, end] = coordinates;
		if (start === undefined || end === undefined) {
			return [];
		}
		return {
			type: 'rect',
			attrs: {
				x: Math.min(start.x, end.x),
				y: Math.min(start.y, end.y),
				width: Math.abs(end.x - start.x),
				height: Math.abs(end.y - start.y),
			},
		};
	},
};
