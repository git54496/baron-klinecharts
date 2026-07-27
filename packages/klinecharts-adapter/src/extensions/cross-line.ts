import type { registerOverlay } from 'klinecharts';

type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];

/** 项目自有十字线标注。 */
export const crossLineOverlay: KLineOverlayTemplate = {
	name: 'crossLine',
	totalStep: 2,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => {
		const point = coordinates[0];
		if (point === undefined) {
			return [];
		}
		return [
			{
				type: 'line',
				attrs: { coordinates: [{ x: 0, y: point.y }, { x: bounding.width, y: point.y }] },
			},
			{
				type: 'line',
				attrs: { coordinates: [{ x: point.x, y: 0 }, { x: point.x, y: bounding.height }] },
			},
		];
	},
};
