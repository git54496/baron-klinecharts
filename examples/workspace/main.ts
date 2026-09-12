import {
	createDrawingFloatingToolbar,
	createDrawableWorkspaceRuntime,
	createChartWorkspaceToolbar,
	type WorkspaceRuntimeEvent,
} from '@baron1996/klinecharts-runtime';
import type { ChartScene, DrawableWorkspaceDocument } from '@baron1996/kline-scene-schema';
import workspace from '../../tests/fixtures/workspaces/chart-minimal.json';

import '../shared.css';

const chart = document.querySelector<HTMLElement>('#chart');
const chartPanel = document.querySelector<HTMLElement>('#chart-panel');
const topToolbarRoot = document.querySelector<HTMLElement>('#toolbar-top');
const leftToolbarRoot = document.querySelector<HTMLElement>('#toolbar-left');
const status = document.querySelector<HTMLElement>('[data-example-status]');
if (
	chart === null ||
	chartPanel === null ||
	topToolbarRoot === null ||
	leftToolbarRoot === null ||
	status === null
) {
	throw new Error('Example mount elements are missing.');
}

const events: WorkspaceRuntimeEvent[] = [];
const exampleWorkspace = structuredClone(workspace) as unknown as DrawableWorkspaceDocument;
const exampleScene = exampleWorkspace.scene.document as ChartScene;
const paneColors = {
	upColor: 'rgba(239, 83, 80, 1)',
	downColor: 'rgba(38, 166, 154, 1)',
	noChangeColor: 'rgba(120, 123, 134, 1)',
};
for (const [kind, name, order] of [
	['volume', 'VOL', 1],
	['turnover', 'TURNOVER', 2],
] as const) {
	exampleScene.panes.push({
		id: `pane-${kind}`,
		kind: 'indicator',
		order,
		height: 120,
		minHeight: 90,
		state: 'normal',
		yAxes: [{
			id: `axis-${kind}`, role: 'primary', position: 'right', reverse: false,
			inside: false, scrollZoomEnabled: false, topGap: 0.1, bottomGap: 0,
			scale: 'linear',
		}],
		indicators: [{
			id: `indicator-${kind}`, name,
			paneId: `pane-${kind}`, yAxisId: `axis-${kind}`,
			calcParams: name === 'VOL' ? [5, 10, 20] : [],
			precision: 8, visible: true, zLevel: 0,
			styles: { lines: [], bars: [paneColors], circles: [] },
		}],
	});
}

try {
	const runtime = await createDrawableWorkspaceRuntime(chart, exampleWorkspace, {
		commitMode: 'immediate',
		drawingInteraction: {
			touch: 'precision-cursor',
			exclusiveSelection: true,
			hitTolerance: {
				mouse: { body: 12, anchor: 14 },
				touch: { body: 22, anchor: 24 },
			},
		},
		onEvent: (event) => events.push(event),
	});
	const toolbar = createChartWorkspaceToolbar({
		top: topToolbarRoot,
		left: leftToolbarRoot,
	}, runtime, {
		indicatorPaneActions: [
			{ paneId: 'pane-volume', label: '成交量', visible: true },
			{ paneId: 'pane-turnover', label: '成交额', visible: true },
		],
		periodActions: [
			{ actionId: 'period.1h', label: '1小时', pressed: true },
			{ actionId: 'period.2h', label: '2小时' },
			{ actionId: 'period.1d', label: '日' },
			{ actionId: 'period.1w', label: '周' },
		],
		settingsHostActions: [
			{ actionId: 'adjustment.none', label: '不复权', pressed: true },
			{ actionId: 'adjustment.qfq', label: '前复权' },
		],
		displayTimezoneChoices: [
			{ value: 'instrument', label: `标的 · ${exampleScene.chart.timezone}`, timezone: exampleScene.chart.timezone },
			{ value: 'local', label: `本机 · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
			{ value: 'utc', label: 'UTC', timezone: 'UTC' },
		],
		activeDisplayTimezoneValue: 'instrument',
		fullscreenTarget: chartPanel,
	});
	const drawingToolbar = createDrawingFloatingToolbar(chart, runtime);
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
