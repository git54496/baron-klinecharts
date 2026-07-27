import '@fontsource-variable/noto-sans-sc';
import {
	createKLineSceneRuntime,
	createStandardToolbar,
	type KLineSceneRuntime,
} from '@baron1996/klinecharts-runtime';

import './style.css';

const SCENE_BASE64 = '__BARON_SCENE_BASE64__';

function decodeScene(): unknown {
	const binary = atob(SCENE_BASE64);
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
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

let runtime: KLineSceneRuntime | undefined;
let destroyToolbar: (() => void) | undefined;

const ready = (async () => {
	const scene = decodeScene();
	const renderRoot = document.querySelector<HTMLElement>('[data-baron-render-root]');
	const toolbarRoot = document.querySelector<HTMLElement>('[data-baron-toolbar-root]');
	if (renderRoot === null || toolbarRoot === null) {
		throw new Error('Standalone HTML render roots are missing.');
	}
	const parsed = scene as {
		chart: { layout: { backgroundColor: string } };
		render: { width: number; height: number; background: string };
	};
	renderRoot.style.width = `${parsed.render.width}px`;
	renderRoot.style.height = `${parsed.render.height}px`;
	renderRoot.style.backgroundColor = parsed.render.background;
	document.body.style.backgroundColor = parsed.chart.layout.backgroundColor;
	runtime = await createKLineSceneRuntime(renderRoot, scene);
	const toolbar = createStandardToolbar(toolbarRoot, runtime);
	destroyToolbar = () => toolbar.destroy();
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

window.__BARON_KLINE_SCENE__ = {
	ready,
	exportScene() {
		if (runtime === undefined) {
			throw new Error('Scene Runtime is not ready.');
		}
		return runtime.exportScene();
	},
	destroy() {
		destroyToolbar?.();
		destroyToolbar = undefined;
		runtime?.destroy();
		runtime = undefined;
	},
};
