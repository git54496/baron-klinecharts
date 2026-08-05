/*
 * Tabler-derived icon geometry is used under the MIT License.
 * See /licenses/Tabler-Icons-LICENSE in the distributed package.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type SvgNodeName = 'circle' | 'path';

interface SvgNodeSpec {
	readonly name: SvgNodeName;
	readonly attributes: Readonly<Record<string, string>>;
}

const ICON_SPECS = {
	horizontalRay: [
		{ name: 'path', attributes: { d: 'M3 12h19' } },
		{ name: 'circle', attributes: { cx: '5', cy: '12', r: '2' } },
		{ name: 'circle', attributes: { cx: '13', cy: '12', r: '1.5' } },
	],
	horizontalSegment: [
		{ name: 'path', attributes: { d: 'M5 12h14' } },
		{ name: 'circle', attributes: { cx: '5', cy: '12', r: '2' } },
		{ name: 'circle', attributes: { cx: '19', cy: '12', r: '2' } },
	],
	horizontalStraight: [
		{ name: 'path', attributes: { d: 'M2 12h20' } },
		{ name: 'circle', attributes: { cx: '8', cy: '12', r: '1.5' } },
		{ name: 'circle', attributes: { cx: '16', cy: '12', r: '1.5' } },
	],
	verticalRay: [
		{ name: 'path', attributes: { d: 'M12 22v-19' } },
		{ name: 'circle', attributes: { cx: '12', cy: '19', r: '2' } },
		{ name: 'circle', attributes: { cx: '12', cy: '11', r: '1.5' } },
	],
	verticalSegment: [
		{ name: 'path', attributes: { d: 'M12 19v-14' } },
		{ name: 'circle', attributes: { cx: '12', cy: '19', r: '2' } },
		{ name: 'circle', attributes: { cx: '12', cy: '5', r: '2' } },
	],
	verticalStraight: [
		{ name: 'path', attributes: { d: 'M12 22v-20' } },
		{ name: 'circle', attributes: { cx: '12', cy: '16', r: '1.5' } },
		{ name: 'circle', attributes: { cx: '12', cy: '8', r: '1.5' } },
	],
	ray: [
		{ name: 'path', attributes: { d: 'M3 21l19 -19' } },
		{ name: 'circle', attributes: { cx: '5', cy: '19', r: '2' } },
		{ name: 'circle', attributes: { cx: '12', cy: '12', r: '1.5' } },
	],
	segment: [
		{ name: 'path', attributes: { d: 'M5 19l14 -14' } },
		{ name: 'circle', attributes: { cx: '5', cy: '19', r: '2' } },
		{ name: 'circle', attributes: { cx: '19', cy: '5', r: '2' } },
	],
	straight: [
		{ name: 'path', attributes: { d: 'M2 22l20 -20' } },
		{ name: 'circle', attributes: { cx: '8', cy: '16', r: '1.5' } },
		{ name: 'circle', attributes: { cx: '16', cy: '8', r: '1.5' } },
	],
	priceLine: [
		{ name: 'path', attributes: { d: 'M3 12h9' } },
		{ name: 'path', attributes: { d: 'M15 8h6v8h-6l-3 -4z' } },
	],
	priceChannel: [
		{ name: 'path', attributes: { d: 'M3 16l12 -12' } },
		{ name: 'path', attributes: { d: 'M9 22l12 -12' } },
		{
			name: 'path',
			attributes: {
				d: 'M6 19l12 -12',
				'stroke-dasharray': '2 3',
			},
		},
	],
	parallelStraight: [
		{ name: 'path', attributes: { d: 'M2 16l14 -14' } },
		{ name: 'path', attributes: { d: 'M8 22l14 -14' } },
		{ name: 'circle', attributes: { cx: '8', cy: '10', r: '1.5' } },
		{ name: 'circle', attributes: { cx: '16', cy: '14', r: '1.5' } },
	],
	fibonacci: [
		{ name: 'path', attributes: { d: 'M4 4h16' } },
		{ name: 'path', attributes: { d: 'M4 8h12' } },
		{ name: 'path', attributes: { d: 'M4 12h16' } },
		{ name: 'path', attributes: { d: 'M4 17h12' } },
		{ name: 'path', attributes: { d: 'M4 21h16' } },
		{ name: 'path', attributes: { d: 'M5 4l14 17' } },
	],
	measurement: [
		{ name: 'path', attributes: { d: 'M4 19l15 -15' } },
		{ name: 'circle', attributes: { cx: '4', cy: '19', r: '2' } },
		{ name: 'circle', attributes: { cx: '19', cy: '4', r: '2' } },
		{ name: 'path', attributes: { d: 'M7 8h9' } },
		{ name: 'path', attributes: { d: 'M12 5v6' } },
	],
	brush: [
		{ name: 'path', attributes: { d: 'M3 21v-4a4 4 0 1 1 4 4h-4' } },
		{ name: 'path', attributes: { d: 'M21 3a16 16 0 0 0 -12.8 10.2' } },
		{ name: 'path', attributes: { d: 'M21 3a16 16 0 0 1 -10.2 12.8' } },
		{ name: 'path', attributes: { d: 'M10.6 9a9 9 0 0 1 4.4 4.4' } },
	],
	pencil: [
		{
			name: 'path',
			attributes: {
				d: 'M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4',
			},
		},
		{ name: 'path', attributes: { d: 'M13.5 6.5l4 4' } },
	],
	tag: [
		{
			name: 'path',
			attributes: { d: 'M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0' },
		},
		{
			name: 'path',
			attributes: {
				d: 'M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3',
			},
		},
	],
	rectangle: [
		{
			name: 'path',
			attributes: {
				d: 'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10',
			},
		},
	],
	arrow: [
		{ name: 'path', attributes: { d: 'M17 7l-10 10' } },
		{ name: 'path', attributes: { d: 'M8 7l9 0l0 9' } },
	],
	crosshair: [
		{ name: 'path', attributes: { d: 'M4 8v-2a2 2 0 0 1 2 -2h2' } },
		{ name: 'path', attributes: { d: 'M4 16v2a2 2 0 0 0 2 2h2' } },
		{ name: 'path', attributes: { d: 'M16 4h2a2 2 0 0 1 2 2v2' } },
		{ name: 'path', attributes: { d: 'M16 20h2a2 2 0 0 0 2 -2v-2' } },
		{ name: 'path', attributes: { d: 'M9 12l6 0' } },
		{ name: 'path', attributes: { d: 'M12 9l0 6' } },
	],
	message: [
		{ name: 'path', attributes: { d: 'M8 9h8' } },
		{ name: 'path', attributes: { d: 'M8 13h6' } },
		{
			name: 'path',
			attributes: {
				d: 'M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12',
			},
		},
	],
	typography: [
		{ name: 'path', attributes: { d: 'M4 20l3 0' } },
		{ name: 'path', attributes: { d: 'M14 20l7 0' } },
		{ name: 'path', attributes: { d: 'M6.9 15l6.9 0' } },
		{ name: 'path', attributes: { d: 'M10.2 6.3l5.8 13.7' } },
		{ name: 'path', attributes: { d: 'M5 20l6 -16l2 0l7 16' } },
	],
	trash: [
		{ name: 'path', attributes: { d: 'M4 7l16 0' } },
		{ name: 'path', attributes: { d: 'M10 11l0 6' } },
		{ name: 'path', attributes: { d: 'M14 11l0 6' } },
		{
			name: 'path',
			attributes: { d: 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12' },
		},
		{
			name: 'path',
			attributes: { d: 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3' },
		},
	],
	clearAll: [
		{ name: 'path', attributes: { d: 'M4 7l16 0' } },
		{ name: 'path', attributes: { d: 'M10 11l4 4' } },
		{ name: 'path', attributes: { d: 'M14 11l-4 4' } },
		{
			name: 'path',
			attributes: { d: 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12' },
		},
		{
			name: 'path',
			attributes: { d: 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3' },
		},
	],
	fileExport: [
		{ name: 'path', attributes: { d: 'M14 3v4a1 1 0 0 0 1 1h4' } },
		{
			name: 'path',
			attributes: {
				d: 'M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3',
			},
		},
	],
} as const satisfies Record<string, readonly SvgNodeSpec[]>;

export type ToolbarIconName = keyof typeof ICON_SPECS;

/** 使用 DOM API 创建符合 24×24 / 2px 规范的工具栏图标。 */
export function createToolbarIcon(name: ToolbarIconName): SVGSVGElement {
	const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');

	for (const spec of ICON_SPECS[name]) {
		const node = document.createElementNS(SVG_NAMESPACE, spec.name);
		for (const [attribute, value] of Object.entries(spec.attributes)) {
			node.setAttribute(attribute, value);
		}
		svg.append(node);
	}

	return svg;
}
