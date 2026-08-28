import '@fontsource-variable/noto-sans-sc';
import {
	createDrawingFloatingToolbar,
	createKLineSceneRuntime,
	createDrawableWorkspaceRuntime,
	createStandardToolbar,
	createTimeSeriesRuntime,
	type DrawableWorkspaceRuntime,
	type KLineSceneRuntime,
	type TimeSeriesRuntime,
} from '@baron1996/klinecharts-runtime';

import { canonicalizePng } from '../src/png-codec.js';
import './style.css';

const SCENE_BASE64 = '__BARON_SCENE_BASE64__';

function decodeScene(): unknown {
	const binary = atob(SCENE_BASE64);
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function decodeBase64(encoded: string): Uint8Array {
	const binary = atob(encoded);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
	const chunkSize = 0x8000;
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return btoa(binary);
}

function nextAnimationFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

function waitForInitialResizeObservation(target: Element): Promise<void> {
	return new Promise((resolve) => {
		const observer = new ResizeObserver((entries) => {
			if (entries.some((entry) => entry.target === target)) {
				observer.disconnect();
				resolve();
			}
		});
		observer.observe(target, { box: 'device-pixel-content-box' });
	});
}

let sceneRuntime: KLineSceneRuntime | TimeSeriesRuntime | undefined;
let workspaceRuntime: DrawableWorkspaceRuntime | undefined;
let destroyToolbar: (() => void) | undefined;
let isWorkspace = false;

const ready = (async () => {
	const scene = decodeScene();
	const renderRoot = document.querySelector<HTMLElement>('[data-baron-render-root]');
	const toolbarRoot = document.querySelector<HTMLElement>('[data-baron-toolbar-root]');
	if (renderRoot === null || toolbarRoot === null) {
		throw new Error('Standalone HTML render roots are missing.');
	}
	const parsed = scene as {
		schema?: unknown;
		scene?: {
			document: {
				chart: { layout: { backgroundColor: string } };
				render: { width: number; height: number; background: string };
			};
		};
		chart?: { layout: { backgroundColor: string } };
		render?: { width: number; height: number; background: string };
	};
	isWorkspace = parsed.schema === '@baron1996/drawable-workspace';
	const renderConfig = isWorkspace
		? parsed.scene!.document.render
		: parsed.render!;
	const chartConfig = isWorkspace
		? parsed.scene!.document.chart
		: parsed.chart!;
	renderRoot.style.width = `${renderConfig.width}px`;
	renderRoot.style.height = `${renderConfig.height}px`;
	renderRoot.style.backgroundColor = renderConfig.background;
	document.body.style.backgroundColor = chartConfig.layout.backgroundColor;
	if (parsed.schema === '@baron1996/kline-scene') {
		sceneRuntime = await createKLineSceneRuntime(renderRoot, scene);
		const toolbar = createStandardToolbar(toolbarRoot, sceneRuntime);
		const drawingToolbar = createDrawingFloatingToolbar(renderRoot, sceneRuntime);
		destroyToolbar = () => {
			drawingToolbar.destroy();
			toolbar.destroy();
		};
	} else if (parsed.schema === '@baron1996/time-series-scene') {
		sceneRuntime = await createTimeSeriesRuntime(renderRoot, scene);
	} else if (isWorkspace) {
		workspaceRuntime = await createDrawableWorkspaceRuntime(renderRoot, scene, {
			commitMode: 'immediate',
		});
		const toolbar = createStandardToolbar(toolbarRoot, workspaceRuntime);
		const drawingToolbar = createDrawingFloatingToolbar(renderRoot, workspaceRuntime);
		destroyToolbar = () => {
			drawingToolbar.destroy();
			toolbar.destroy();
		};
	} else {
		throw new Error('Standalone HTML contains an unsupported Scene schema.');
	}
	await document.fonts.ready;
	// KLineCharts 10 会先在 body 上探测 device-pixel-content-box，再为每个 Canvas
	// 创建 ResizeObserver。只有这两轮初始通知都完成后，画布尺寸和绘制任务才稳定。
	await waitForInitialResizeObservation(document.body);
	const firstCanvas = renderRoot.querySelector('canvas');
	if (firstCanvas === null) {
		throw new Error('KLineCharts did not create a render canvas.');
	}
	await waitForInitialResizeObservation(firstCanvas);
	await Promise.resolve();
	await nextAnimationFrame();
	await nextAnimationFrame();
})();

if (isWorkspace) {
	window.__BARON_DRAWABLE_WORKSPACE__ = {
		ready,
		canonicalizePng(encoded) {
			return encodeBase64(canonicalizePng(decodeBase64(encoded)));
		},
		exportWorkspace() {
			if (workspaceRuntime === undefined) {
				throw new Error('Workspace Runtime is not ready.');
			}
			return workspaceRuntime.exportWorkspace();
		},
		destroy() {
			destroyToolbar?.();
			destroyToolbar = undefined;
			workspaceRuntime?.destroy();
			workspaceRuntime = undefined;
		},
	};
} else {
	window.__BARON_KLINE_SCENE__ = {
		ready,
		canonicalizePng(encoded) {
			return encodeBase64(canonicalizePng(decodeBase64(encoded)));
		},
		exportScene() {
			if (sceneRuntime === undefined) {
				throw new Error('Scene Runtime is not ready.');
			}
			return sceneRuntime.exportScene();
		},
		destroy() {
			destroyToolbar?.();
			destroyToolbar = undefined;
			sceneRuntime?.destroy();
			sceneRuntime = undefined;
		},
	};
}
