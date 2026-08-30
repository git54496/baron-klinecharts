import {
	createDrawingFloatingToolbar,
	createKLineSceneRuntime,
	createStandardToolbar,
} from '@baron1996/klinecharts-runtime';
import scene from './mock-year.scene.json';

import '../shared.css';

const chart = document.querySelector<HTMLElement>('#chart');
const toolbarRoot = document.querySelector<HTMLElement>('#toolbar');
const status = document.querySelector<HTMLElement>('[data-example-status]');
if (chart === null || toolbarRoot === null || status === null) {
	throw new Error('Example mount elements are missing.');
}

try {
	const runtime = await createKLineSceneRuntime(chart, scene);
	const toolbar = createStandardToolbar(toolbarRoot, runtime, {
		downloadFileName: 'baron-mock-scene.json',
	});
	const drawingToolbar = createDrawingFloatingToolbar(chart, runtime);
	status.dataset.state = 'ready';
	status.textContent = `已加载 ${scene.symbol.ticker} · ${scene.data.length} 根日 K`;

	window.addEventListener('beforeunload', () => {
		drawingToolbar.destroy();
		toolbar.destroy();
		runtime.destroy();
	}, { once: true });
} catch (error) {
	status.dataset.state = 'error';
	status.textContent = error instanceof Error
		? `加载失败：${error.message}`
		: '加载失败：未知错误';
	throw error;
}
