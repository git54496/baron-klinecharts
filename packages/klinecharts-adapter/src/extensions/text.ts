import type { registerOverlay } from 'klinecharts';

type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];

/** 项目自有自由文字标注。 */
export const textOverlay: KLineOverlayTemplate = {
	name: 'text',
	totalStep: 2,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, overlay }) => {
		const point = coordinates[0];
		if (point === undefined) {
			return [];
		}
		return {
			type: 'text',
			attrs: {
				x: point.x,
				y: point.y,
				text: typeof overlay.extendData === 'string' ? overlay.extendData : '',
				align: 'left',
				baseline: 'middle',
			},
		};
	},
};
