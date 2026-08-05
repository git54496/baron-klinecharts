import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

import {
	renderDrawableWorkspacePng,
} from '../src/drawable-workspace-png.js';
import { buildDrawableWorkspaceStandaloneHtml } from '../src/drawable-workspace-html.js';
import { canonicalizePng, decodeRgbaPng } from '../src/png-codec.js';
import { loadWorkspaceFixture } from './load-workspace.js';

function pngDimensions(bytes: Uint8Array): {
	readonly width: number;
	readonly height: number;
} {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		width: view.getUint32(16),
		height: view.getUint32(20),
	};
}

/** 录制 Canvas 上指定颜色的描边锚点，用于核对折线与 Drawing 的真实像素位置。 */
const CANVAS_STROKE_RECORDER = `
(() => {
	const strokes = [];
	let current = [];
	const proto = CanvasRenderingContext2D.prototype;
	const original = {
		beginPath: proto.beginPath,
		moveTo: proto.moveTo,
		lineTo: proto.lineTo,
		stroke: proto.stroke,
	};
	const strokeStyleDescriptor = Object.getOwnPropertyDescriptor(
		proto,
		'strokeStyle',
	);
	if (strokeStyleDescriptor === undefined) {
		throw new Error('CanvasRenderingContext2D strokeStyle is missing.');
	}
	Object.defineProperty(proto, 'strokeStyle', {
		get() {
			return strokeStyleDescriptor.get.call(this);
		},
		set(value) {
			strokeStyleDescriptor.set.call(this, value);
		},
		configurable: true,
	});
	proto.beginPath = function beginPath() {
		current = [];
		return original.beginPath.call(this);
	};
	proto.moveTo = function moveTo(x, y) {
		current.push([x, y]);
		return original.moveTo.call(this, x, y);
	};
	proto.lineTo = function lineTo(x, y) {
		current.push([x, y]);
		return original.lineTo.call(this, x, y);
	};
	proto.stroke = function stroke() {
		const style = String(this.strokeStyle);
		if (current.length > 0) {
			strokes.push({ style, points: current.slice() });
			current = [];
		}
		return original.stroke.call(this);
	};
	window.__baronStrokes = strokes;
})();
`;

const AREA_LINE_COLOR = 'rgba(41, 98, 255, 1)';
const AREA_LINE_COLOR_HEX = '#2962ff';
const DRAWING_COLOR = 'rgba(255, 0, 255, 1)';

describe('DrawableWorkspace PNG renderer', () => {
	it('renders a chart Workspace PNG at the embedded render size', async () => {
		const workspace = await loadWorkspaceFixture('chart');
		const directory = await mkdtemp(join(tmpdir(), 'baron-workspace-png-'));
		const output = join(directory, 'workspace.png');
		try {
			await renderDrawableWorkspacePng(workspace, output);
			const bytes = await readFile(output);
			expect(bytes.length).toBeGreaterThan(0);
			expect(pngDimensions(bytes)).toEqual({
				width: workspace.scene.document.render.width,
				height: workspace.scene.document.render.height,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}, 60_000);

	it('area PNG line follows close point by point while open/high/low do not', async () => {
		const workspace = await loadWorkspaceFixture('chart');
		const areaScene = JSON.parse(
			await readFile(
				join(
					import.meta.dirname,
					'..',
					'..',
					'..',
					'tests',
					'fixtures',
					'scenes',
					'chart-area-close-line.json',
				),
				'utf8',
			),
		);
		workspace.scene.document.chart.candle = areaScene.chart.candle;
		const closes = workspace.scene.document.data.map(
			(point: { readonly close: number }) => point.close,
		);
		const alternatives = [
			workspace.scene.document.data.map(
				(point: { readonly open: number }) => point.open,
			),
			workspace.scene.document.data.map(
				(point: { readonly high: number }) => point.high,
			),
			workspace.scene.document.data.map(
				(point: { readonly low: number }) => point.low,
			),
		];
		const directory = await mkdtemp(join(tmpdir(), 'baron-area-png-'));
		try {
			const output = join(directory, 'area.png');
			await renderDrawableWorkspacePng(workspace, output);
			const pngBytes = await readFile(output);
			const browser = await chromium.launch({ headless: true });
			try {
				const scene = workspace.scene.document;
				const context = await browser.newContext({
					viewport: {
						width: scene.render.width,
						height: scene.render.height,
					},
					deviceScaleFactor: scene.render.deviceScaleFactor,
					locale: scene.chart.locale,
					timezoneId: scene.chart.timezone,
					offline: true,
					serviceWorkers: 'block',
					reducedMotion: 'reduce',
				});
				try {
					await context.addInitScript(CANVAS_STROKE_RECORDER);
					const page = await context.newPage();
					await page.setContent(
						buildDrawableWorkspaceStandaloneHtml(workspace),
						{ waitUntil: 'load' },
					);
					await page.evaluate(
						() => window.__BARON_DRAWABLE_WORKSPACE__.ready,
					);
					const screenshot = await page
						.locator('[data-baron-render-root]')
						.screenshot({
							type: 'png',
							animations: 'disabled',
							caret: 'hide',
							scale: 'device',
						});
					const recorded = await page.evaluate(
						() => window.__baronStrokes as readonly {
							readonly style: string;
							readonly points: readonly (readonly number[])[];
						}[],
					);
					// PNG 与同 Workspace 的浏览器投影必须逐字节一致。
					expect(
						Buffer.compare(
							Buffer.from(canonicalizePng(screenshot)),
							pngBytes,
						),
					).toBe(0);
					const candidates = recorded
						.filter(
							(stroke) =>
								(stroke.style === AREA_LINE_COLOR ||
									stroke.style.toLowerCase() === AREA_LINE_COLOR_HEX) &&
								stroke.points.length === closes.length &&
								stroke.points.every(
									(point) =>
										point[0] >= 0 &&
										point[0] <= scene.render.width &&
										point[1] >= 0 &&
										point[1] <= scene.render.height,
								),
						)
						.map((stroke) => stroke.points);
					// 用首尾两个 close 锚点拟合线性值轴，逐点反推中间锚点；
					// 只有真正来自 close 的折线能通过该筛选。
					const matching = candidates.filter((candidate) => {
						const [x0, y0] = candidate[0]!;
						const [x2, y2] = candidate[2]!;
						if (x2 <= x0) {
							return false;
						}
						const slope = (y2 - y0) / (closes[2]! - closes[0]!);
						const intercept = y0 - slope * closes[0]!;
						const expectedMiddle = slope * closes[1]! + intercept;
						return (
							Math.abs(candidate[1]![1] - expectedMiddle) <= 1.5 &&
							alternatives.every(
								(series) =>
									Math.abs(
										slope * series[1]! + intercept - candidate[1]![1],
									) > 5,
							)
						);
					});
					expect(matching).toHaveLength(1);
					const anchors = matching[0]!;
					const [x0, y0] = anchors[0]!;
					const [x2, y2] = anchors[2]!;
					expect(x2).toBeGreaterThan(x0);
					// 用首尾两个 close 锚点拟合线性值轴，再逐点反推中间锚点。
					const slope = (y2 - y0) / (closes[2]! - closes[0]!);
					const intercept = y0 - slope * closes[0]!;
					const expectedMiddle = slope * closes[1]! + intercept;
					expect(
						Math.abs(anchors[1]![1] - expectedMiddle),
					).toBeLessThanOrEqual(1.5);
					for (const series of alternatives) {
						const alternativeMiddle = slope * series[1]! + intercept;
						expect(Math.abs(alternativeMiddle - anchors[1]![1])).toBeGreaterThan(5);
					}
					await page.evaluate(
						() => window.__BARON_DRAWABLE_WORKSPACE__.destroy(),
					);
				} finally {
					await context.close();
				}
			} finally {
				await browser.close();
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}, 120_000);

	it('candle and area Workspace PNGs keep identical Drawing pixels', async () => {
		const base = await loadWorkspaceFixture('chart');
		base.scene.document.data = [
			{
				timestamp: 1784736000000,
				open: 12,
				high: 13,
				low: 12,
				close: 12,
				volume: 102400,
				turnover: 1285120,
			},
			{
				timestamp: 1784822400000,
				open: 13,
				high: 14,
				low: 13,
				close: 14,
				volume: 119800,
				turnover: 1526252,
			},
			{
				timestamp: 1784908800000,
				open: 14,
				high: 15,
				low: 14,
				close: 15,
				volume: 98400,
				turnover: 1242792,
			},
		];
		const vertical = {
			id: 'drawing-verticalStraightLine-png',
			target: { paneRole: 'candle', yAxisRole: 'primary' },
			visible: true,
			locked: false,
			zLevel: 3,
			mode: 'normal',
			styles: {
				line: { color: DRAWING_COLOR, size: 2, style: 'solid' },
				fill: { color: DRAWING_COLOR },
				text: {
					color: DRAWING_COLOR,
					size: 12,
					family: 'Baron Sans',
					weight: 'normal',
					backgroundColor: DRAWING_COLOR,
					borderColor: DRAWING_COLOR,
				},
			},
			metadata: {},
			type: 'verticalStraightLine',
			geometry: { time: 1784822400000 },
		};
		const horizontal = {
			id: 'drawing-horizontalStraightLine-png',
			target: { paneRole: 'candle', yAxisRole: 'primary' },
			visible: true,
			locked: false,
			zLevel: 3,
			mode: 'normal',
			styles: {
				line: { color: DRAWING_COLOR, size: 2, style: 'solid' },
				fill: { color: DRAWING_COLOR },
				text: {
					color: DRAWING_COLOR,
					size: 12,
					family: 'Baron Sans',
					weight: 'normal',
					backgroundColor: DRAWING_COLOR,
					borderColor: DRAWING_COLOR,
				},
			},
			metadata: {},
			type: 'horizontalStraightLine',
			geometry: { value: 13.5 },
		};
		base.drawings.drawings = [vertical, horizontal];
		const areaScene = JSON.parse(
			await readFile(
				join(
					import.meta.dirname,
					'..',
					'..',
					'..',
					'tests',
					'fixtures',
					'scenes',
					'chart-area-close-line.json',
				),
				'utf8',
			),
		);
		const candle = structuredClone(base);
		const area = structuredClone(base);
		area.scene.document.chart.candle = areaScene.chart.candle;
		const directory = await mkdtemp(join(tmpdir(), 'baron-drawing-png-'));
		try {
			const candleOutput = join(directory, 'candle.png');
			const areaOutput = join(directory, 'area.png');
			await renderDrawableWorkspacePng(candle, candleOutput);
			await renderDrawableWorkspacePng(area, areaOutput);
			const candleDecoded = decodeRgbaPng(await readFile(candleOutput));
			const areaDecoded = decodeRgbaPng(await readFile(areaOutput));
			const collect = (decoded: ReturnType<typeof decodeRgbaPng>) => {
				const pixels = new Set<string>();
				for (let y = 0; y < decoded.height; y += 1) {
					for (let x = 0; x < decoded.width; x += 1) {
						const offset = (y * decoded.width + x) * 4;
						if (
							decoded.rgba[offset] === 255 &&
							decoded.rgba[offset + 1] === 0 &&
							decoded.rgba[offset + 2] === 255 &&
							decoded.rgba[offset + 3] === 255
						) {
							pixels.add(`${x},${y}`);
						}
					}
				}
				return pixels;
			};
			const candleDrawingPixels = collect(candleDecoded);
			const areaDrawingPixels = collect(areaDecoded);
			expect(candleDrawingPixels.size).toBeGreaterThan(0);
			expect(areaDrawingPixels).toEqual(candleDrawingPixels);
			// 只允许底图视觉变化：Drawing 像素一致，但整张 PNG 必须不同。
			const candleBytes = await readFile(candleOutput);
			const areaBytes = await readFile(areaOutput);
			expect(areaBytes).not.toEqual(candleBytes);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}, 120_000);
});
