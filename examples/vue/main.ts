import {
	createApp,
	h,
	onBeforeUnmount,
	onMounted,
	ref,
} from 'vue';

import {
	createKLineSceneRuntime,
	createStandardToolbar,
	type KLineSceneRuntime,
	type StandardToolbar,
} from '@baron1996/klinecharts-runtime';
import scene from '../../tests/fixtures/scenes/all-overlays.json';

import '../shared.css';

createApp({
	setup() {
		const chart = ref<HTMLElement>();
		const toolbarRoot = ref<HTMLElement>();
		let runtime: KLineSceneRuntime | undefined;
		let toolbar: StandardToolbar | undefined;

		onMounted(async () => {
			if (chart.value === undefined || toolbarRoot.value === undefined) {
				throw new Error('Vue mount elements are missing.');
			}
			runtime = await createKLineSceneRuntime(chart.value, scene);
			toolbar = createStandardToolbar(toolbarRoot.value, runtime);
		});
		onBeforeUnmount(() => {
			toolbar?.destroy();
			runtime?.destroy();
		});

		return () => h('div', [
			h('div', { ref: toolbarRoot, class: 'toolbar' }),
			h('div', { ref: chart, class: 'chart' }),
		]);
	},
}).mount('#app');
