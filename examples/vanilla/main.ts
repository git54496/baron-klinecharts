import {
	createKLineSceneRuntime,
	createStandardToolbar,
} from '@baron1996/klinecharts-runtime';
import scene from '../../tests/fixtures/scenes/all-overlays.json';

import '../shared.css';

const chart = document.querySelector<HTMLElement>('#chart');
const toolbarRoot = document.querySelector<HTMLElement>('#toolbar');
if (chart === null || toolbarRoot === null) {
	throw new Error('Example mount elements are missing.');
}

const runtime = await createKLineSceneRuntime(chart, scene);
const toolbar = createStandardToolbar(toolbarRoot, runtime);

window.addEventListener('beforeunload', () => {
	toolbar.destroy();
	runtime.destroy();
}, { once: true });
