import {
	createDrawableWorkspaceRuntime,
	createStandardToolbar,
	type WorkspaceRuntimeEvent,
} from '@baron1996/klinecharts-runtime';
import workspace from '../../tests/fixtures/workspaces/time-series-minimal.json';

import '../shared.css';

const chart = document.querySelector<HTMLElement>('#chart');
const toolbarRoot = document.querySelector<HTMLElement>('#toolbar');
const status = document.querySelector<HTMLElement>('[data-example-status]');
if (chart === null || toolbarRoot === null || status === null) {
	throw new Error('Example mount elements are missing.');
}

const events: WorkspaceRuntimeEvent[] = [];

try {
	const runtime = await createDrawableWorkspaceRuntime(chart, workspace, {
		commitMode: 'immediate',
		onEvent: (event) => events.push(event),
	});
	const toolbar = createStandardToolbar(toolbarRoot, runtime, {
		mainSeriesPresentationControl: 'enabled',
		downloadFileName: 'baron-workspace-time-series.json',
		editControlsPlacement: 'context-menu',
		contextMenuTarget: chart,
	});
	status.dataset.state = 'ready';
	status.textContent = `已加载 ${workspace.drawings.drawings.length} 条 Drawing · 22 种工具可用`;

	// 便于在 DevTools 中直接调用 Workspace 导出与事件观察。
	(window as typeof window & {
		__baronWorkspace?: {
			readonly exportWorkspace: () => unknown;
			readonly events: readonly WorkspaceRuntimeEvent[];
		};
	}).__baronWorkspace = {
		exportWorkspace: () => runtime.exportWorkspace(),
		events,
	};

	window.addEventListener('beforeunload', () => {
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
