import type { registerOverlay } from 'klinecharts';

type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];

/** 项目自有箭头标注。 */
export const arrowOverlay: KLineOverlayTemplate = {
	name: 'arrow',
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
		const angle = Math.atan2(end.y - start.y, end.x - start.x);
		const headLength = 12;
		const left = {
			x: end.x - headLength * Math.cos(angle - Math.PI / 6),
			y: end.y - headLength * Math.sin(angle - Math.PI / 6),
		};
		const right = {
			x: end.x - headLength * Math.cos(angle + Math.PI / 6),
			y: end.y - headLength * Math.sin(angle + Math.PI / 6),
		};
		return [
			{ type: 'line', attrs: { coordinates: [start, end] } },
			{ type: 'polygon', attrs: { coordinates: [end, left, right] } },
		];
	},
};
