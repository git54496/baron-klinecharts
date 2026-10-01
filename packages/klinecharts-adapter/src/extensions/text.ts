import type { FigureTemplate, registerOverlay, TextStyle } from 'klinecharts';
import { projectTextPoint, textBoxLayout, textPeriodLabel, TEXT_BADGE_SIZE, type TextBox } from '../drawing/text-box.js';
import type { Period } from '@baron1996/kline-scene-schema';
type TextData = {
	text: string;
	box?: TextBox;
	period?: Period;
	selected?: boolean;
};
type TextAttrs = {
	x: number;
	y: number;
	width: number;
	height: number;
	text: string;
	label: string;
	collapsed: boolean;
	selected: boolean;
	limit: number;
};
export const scaledTextFigure: FigureTemplate<TextAttrs, TextStyle> = {
	name: 'baronScaledText',
	checkEventOn: (p, a) => p.x >= a.x && p.x <= a.x + (a.collapsed ? TEXT_BADGE_SIZE : a.width) && p.y >= a.y && p.y <= a.y + (a.collapsed ? TEXT_BADGE_SIZE : a.height),
	draw: (ctx, a, s) => {
		ctx.save();
		const size = s.size ?? 12;
		ctx.font = `${s.weight ?? 'normal'} ${size}px ${s.family ?? 'sans-serif'}`;
		ctx.fillStyle = s.backgroundColor ?? '#2962ff';
		if (a.collapsed) {
			ctx.beginPath();
			ctx.arc(a.x + 16, a.y + 16, 16, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = s.color ?? '#fff';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(a.label, a.x + 16, a.y + 16, 27);
			if (a.selected) {
				const lines: string[] = [];
				let line = '';
				for (const ch of `${a.label} ${a.text}`) {
					if (ctx.measureText(line + ch).width > 240) {
						lines.push(line);
						line = '';
					}
					line += ch;
				}
				lines.push(line);
				const width = 256, height = lines.length * (size * 1.5) + 16, x = Math.max(0, Math.min(a.x + 40, a.limit - width)), y = Math.max(0, a.y - height - 6);
				ctx.fillStyle = s.backgroundColor ?? '#2962ff';
				ctx.fillRect(x, y, width, height);
				ctx.fillStyle = s.color ?? '#fff';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				lines.forEach((text, i) => ctx.fillText(text, x + 8, y + 8 + i * size * 1.5));
			}
		}
		else {
			ctx.fillRect(a.x, a.y, a.width, a.height);
			const text = `${a.label ? a.label + ' ' : ''}${a.text}`;
			const measured = Math.max(1, ctx.measureText(text).width);
			// Fit within the projected box without distorting the glyphs when its axes scale differently.
			const scale = Math.min(Math.max(1, a.width - 8) / measured, Math.max(1, a.height - 6) / (size * 1.4));
			ctx.translate(a.x + 4, a.y + 3);
			ctx.scale(scale, scale);
			ctx.fillStyle = s.color ?? '#fff';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'top';
			ctx.fillText(text, 0, 0);
		}
		ctx.restore();
	}
};
export const textOverlay: Parameters<typeof registerOverlay>[0] = {
	name: 'text', totalStep: 2, needDefaultPointFigure: false, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, overlay, chart, bounding }) => {
		const point = coordinates[0];
		if (!point)
			return [];
		const data: TextData = typeof overlay.extendData === 'string' ? { text: overlay.extendData } : overlay.extendData as TextData;
		if (!data?.box)
			return { type: 'text', attrs: { x: point.x, y: point.y, text: `${textPeriodLabel(data?.period)} ${data?.text ?? ''}`.trim(), align: 'left', baseline: 'middle' } };
		const start = projectTextPoint(chart, overlay.paneId, overlay.points[0] as {
			timestamp: number;
			value: number;
		});
		const end = projectTextPoint(chart, overlay.paneId, data.box.end);
		const layout = textBoxLayout(start, end, data.box);
		const figure = { type: 'baronScaledText', attrs: { ...layout, text: data.text, label: textPeriodLabel(data.period), selected: data.selected === true, limit: bounding.width }, styles: overlay.styles?.text };
		const corners = data.selected && !layout.collapsed && !overlay.lock
			? [start, end, { x: end.x, y: start.y }, { x: start.x, y: end.y }].map(point => ({
				type: 'circle', attrs: { x: point.x, y: point.y, r: 5 }, ignoreEvent: true,
				styles: { style: 'stroke_fill', color: '#fff', borderColor: overlay.styles?.text?.backgroundColor ?? '#2962ff', borderSize: 2 },
			}))
			: [];
		return [figure, ...corners];
	}
};
