import { serializeCanonicalScene } from '@baron1996/kline-scene-schema';
import { SUPPORTED_OVERLAYS } from '@baron1996/klinecharts-adapter';

import { registerRuntimeTeardown } from '../lifecycle.js';
import type { KLineSceneRuntime } from '../runtime.js';
import type {
	StandardToolbar,
	StandardToolbarOptions,
} from '../types.js';

function createButton(label: string, action: () => void): {
	readonly element: HTMLButtonElement;
	readonly cleanup: () => void;
} {
	const element = document.createElement('button');
	element.type = 'button';
	element.textContent = label;
	element.addEventListener('click', action);
	return {
		element,
		cleanup: () => element.removeEventListener('click', action),
	};
}

function downloadScene(runtime: KLineSceneRuntime, fileName: string): void {
	const bytes = serializeCanonicalScene(runtime.exportScene());
	const blob = new Blob([bytes], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	URL.revokeObjectURL(url);
}

/** 创建不含撤销/重做的标准离线编辑工具栏。 */
export function createStandardToolbar(
	container: HTMLElement,
	runtime: KLineSceneRuntime,
	options: StandardToolbarOptions = {},
): StandardToolbar {
	const root = document.createElement('div');
	root.className = 'baron-kline-toolbar';
	root.setAttribute('role', 'toolbar');
	root.setAttribute('aria-label', 'K 线标注工具');
	const cleanupCallbacks: Array<() => void> = [];
	const textInput = document.createElement('input');
	textInput.type = 'text';
	textInput.dataset.action = 'overlay-text';
	textInput.setAttribute('aria-label', '标注文本');
	textInput.placeholder = '输入标注文本';
	root.append(textInput);
	const textOverlayTypes = new Set(['simpleAnnotation', 'simpleTag', 'callout', 'text']);

	for (const type of SUPPORTED_OVERLAYS) {
		const button = createButton(type, () => {
			runtime.startOverlayDrawing(
				type,
				textOverlayTypes.has(type) ? { text: textInput.value } : {},
			);
		});
		button.element.dataset.overlayType = type;
		root.append(button.element);
		cleanupCallbacks.push(button.cleanup);
	}

	const remove = createButton('删除选中标注', () => {
		const id = runtime.getSelectedOverlayId();
		if (id === undefined) {
			return;
		}
		const overlay = runtime.getOverlay(id);
		if (overlay !== undefined && !overlay.locked) {
			runtime.removeOverlay(id);
		}
	});
	remove.element.dataset.action = 'delete';
	root.append(remove.element);
	cleanupCallbacks.push(remove.cleanup);

	const exportButton = createButton('导出场景', () => {
		downloadScene(runtime, options.downloadFileName ?? 'kline-scene.json');
	});
	exportButton.element.dataset.action = 'export';
	root.append(exportButton.element);
	cleanupCallbacks.push(exportButton.cleanup);

	container.append(root);
	let destroyed = false;
	let unregisterRuntime = () => {};
	const toolbar: StandardToolbar = {
		element: root,
		destroy(): void {
			if (destroyed) {
				return;
			}
			destroyed = true;
			unregisterRuntime();
			for (const cleanup of cleanupCallbacks) {
				cleanup();
			}
			root.remove();
		},
	};
	unregisterRuntime = registerRuntimeTeardown(runtime, () => toolbar.destroy());
	return toolbar;
}
