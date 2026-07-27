import type { registerOverlay } from 'klinecharts';

type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];

/** 项目自有气泡文字标注。 */
export const calloutOverlay: KLineOverlayTemplate = {
	name: 'callout',
	totalStep: 2,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, overlay }) => {
		const point = coordinates[0];
		if (point === undefined) {
			return [];
		}
		const text = typeof overlay.extendData === 'string' ? overlay.extendData : '';
		return [
			{
				type: 'line',
				attrs: {
					coordinates: [point, { x: point.x + 16, y: point.y - 24 }],
				},
			},
			{
				type: 'text',
				attrs: {
					x: point.x + 16,
					y: point.y - 24,
					text,
					align: 'left',
					baseline: 'bottom',
				},
			},
		];
	},
};
