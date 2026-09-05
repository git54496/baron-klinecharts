import type { EngineDrawingSnapshot } from '@baron1996/klinecharts-adapter';

import { registerRuntimeTeardown } from '../lifecycle.js';
import type { DrawingRuntimeCapability } from '../drawing/capabilities.js';
import type {
	DrawingFloatingToolbar,
	DrawingFloatingToolbarOptions,
} from '../types.js';
import { createToolbarIcon } from './toolbar-icons.js';
import { OVERLAY_TOOL_PRESENTATIONS } from './toolbar-tools.js';
import { DRAWING_FLOATING_TOOLBAR_STYLES } from './drawing-floating-toolbar-styles.js';

const VIEWPORT_PADDING = 8;
const TARGET_PADDING = 10;
const TARGET_TOP_GAP = 12;
const TEXT_DRAWING_TYPES = new Set(['simpleAnnotation', 'simpleTag', 'callout', 'text']);

function htmlHexColorToSceneRgba(value: string): string {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
	if (match === null) {
		throw new TypeError(`Invalid HTML color value: ${value}`);
	}
	return `rgba(${Number.parseInt(match[1]!, 16)}, ${Number.parseInt(match[2]!, 16)}, ${Number.parseInt(match[3]!, 16)}, 1)`;
}

function sceneColorToHtmlHex(value: string): string {
	const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
	if (hex !== null) {
		return `#${hex[1]!.toLowerCase()}`;
	}
	const rgba = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i.exec(value);
	if (rgba === null) {
		return '#2962ff';
	}
	return `#${[rgba[1], rgba[2], rgba[3]]
		.map((component) => Math.max(0, Math.min(255, Math.round(Number(component)))).toString(16).padStart(2, '0'))
		.join('')}`;
}

function createSeparator(): HTMLSpanElement {
	const separator = document.createElement('span');
	separator.className = 'baron-drawing-toolbar__separator';
	separator.setAttribute('aria-hidden', 'true');
	return separator;
}

function createSelect(
	className: string,
	action: string,
	label: string,
	values: readonly { readonly value: string; readonly label: string }[],
): { readonly label: HTMLLabelElement; readonly select: HTMLSelectElement } {
	const root = document.createElement('label');
	root.className = `baron-drawing-toolbar__control ${className}`;
	const select = document.createElement('select');
	select.dataset.action = action;
	select.setAttribute('aria-label', label);
	for (const item of values) {
		const option = document.createElement('option');
		option.value = item.value;
		option.textContent = item.label;
		select.append(option);
	}
	root.append(select);
	return { label: root, select };
}

function createButton(
	action: string,
	label: string,
	icon: 'lock' | 'lockOpen' | 'trash',
): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'baron-drawing-toolbar__button';
	button.dataset.action = action;
	button.setAttribute('aria-label', label);
	button.title = label;
	button.append(createToolbarIcon(icon));
	return button;
}

function selectedDrawing(runtime: DrawingRuntimeCapability): EngineDrawingSnapshot | undefined {
	const id = runtime.getSelectedDrawingId();
	return id === undefined ? undefined : runtime.getDrawing(id);
}

/**
 * 创建选中 Drawing 的对象级浮动工具栏。普通模式使用 body portal，目标图表所属工作区
 * 进入元素全屏时迁入对应全屏子树；拖动位置只保存在当前实例内，刷新后回到图表顶部中央。
 */
export function createDrawingFloatingToolbar(
	target: HTMLElement,
	runtime: DrawingRuntimeCapability,
	options: DrawingFloatingToolbarOptions = {},
): DrawingFloatingToolbar {
	const style = document.createElement('style');
	style.dataset.baronDrawingToolbarStyles = '';
	style.textContent = DRAWING_FLOATING_TOOLBAR_STYLES;
	const root = document.createElement('div');
	root.className = 'baron-drawing-toolbar';
	root.setAttribute('role', 'toolbar');
	root.setAttribute('aria-label', '选中 Drawing 设置');
	root.hidden = true;

	const grip = document.createElement('button');
	grip.type = 'button';
	grip.className = 'baron-drawing-toolbar__grip';
	grip.dataset.action = 'drag';
	grip.setAttribute('aria-label', '拖动 Drawing 工具栏');
	grip.title = '拖动工具栏';
	for (let index = 0; index < 6; index++) {
		const dot = document.createElement('span');
		dot.className = 'baron-drawing-toolbar__grip-dot';
		grip.append(dot);
	}
	grip.hidden = options.draggable === false;

	const type = document.createElement('span');
	type.className = 'baron-drawing-toolbar__type';
	type.dataset.action = 'drawing-type';

	const color = document.createElement('label');
	color.className = 'baron-drawing-toolbar__color';
	color.setAttribute('aria-label', '线色');
	color.title = '线色';
	const colorIcon = document.createElement('span');
	colorIcon.className = 'baron-drawing-toolbar__color-icon';
	const colorInput = document.createElement('input');
	colorInput.type = 'color';
	colorInput.dataset.action = 'line-color';
	colorInput.setAttribute('aria-label', '线色');
	color.append(colorIcon, colorInput);

	const lineStyle = createSelect(
		'baron-drawing-toolbar__control--style',
		'line-style',
		'线型',
		[
			{ value: 'solid', label: '实线' },
			{ value: 'dashed', label: '虚线' },
			{ value: 'dotted', label: '点线' },
		],
	);
	const lineWidth = createSelect(
		'baron-drawing-toolbar__control--width',
		'line-width',
		'线宽',
		[0.5, 1, 1.5, 2, 3, 4, 6, 8, 10].map((value) => ({
			value: String(value),
			label: `${value}px`,
		})),
	);
	const textInput = document.createElement('input');
	textInput.type = 'text';
	textInput.className = 'baron-drawing-toolbar__text';
	textInput.dataset.action = 'drawing-text';
	textInput.setAttribute('aria-label', 'Drawing 文本');
	textInput.placeholder = '输入文本';
	textInput.hidden = true;

	const lock = createButton('toggle-lock', '锁定 Drawing', 'lock');
	const remove = createButton('delete', '删除 Drawing', 'trash');
	const status = document.createElement('span');
	status.className = 'baron-drawing-toolbar__status';
	status.setAttribute('role', 'status');
	status.setAttribute('aria-live', 'polite');
	status.hidden = true;

	root.append(
		grip,
		type,
		createSeparator(),
		color,
		lineStyle.label,
		lineWidth.label,
		textInput,
		createSeparator(),
		lock,
		remove,
		status,
	);
	document.head.append(style);
	const resolvePortalHost = (): ParentNode => {
		const fullscreenElement = document.fullscreenElement;
		return fullscreenElement !== null && fullscreenElement.contains(target)
			? fullscreenElement
			: document.body;
	};
	resolvePortalHost().append(root);

	let destroyed = false;
	let userPositioned = false;
	let dragging: {
		readonly pointerId: number;
		readonly offsetX: number;
		readonly offsetY: number;
	} | null = null;
	let currentId: string | undefined;

	const setStatus = (message: string): void => {
		status.textContent = message;
		status.hidden = message.length === 0;
	};

	const bounds = (): {
		readonly minLeft: number;
		readonly maxLeft: number;
		readonly minTop: number;
		readonly maxTop: number;
	} => {
		const targetRect = target.getBoundingClientRect();
		const width = root.offsetWidth;
		const height = root.offsetHeight;
		const viewportMinLeft = VIEWPORT_PADDING;
		const viewportMaxLeft = Math.max(viewportMinLeft, window.innerWidth - width - VIEWPORT_PADDING);
		const targetMinLeft = targetRect.left + TARGET_PADDING;
		const targetMaxLeft = targetRect.right - width - TARGET_PADDING;
		const minLeft = Math.max(viewportMinLeft, Math.min(targetMinLeft, viewportMaxLeft));
		const maxLeft = Math.max(minLeft, Math.min(viewportMaxLeft, targetMaxLeft));
		const viewportMinTop = VIEWPORT_PADDING;
		const viewportMaxTop = Math.max(viewportMinTop, window.innerHeight - height - VIEWPORT_PADDING);
		const targetMinTop = targetRect.top + TARGET_PADDING;
		const targetMaxTop = targetRect.bottom - height - TARGET_PADDING;
		const minTop = Math.max(viewportMinTop, Math.min(targetMinTop, viewportMaxTop));
		const maxTop = Math.max(minTop, Math.min(viewportMaxTop, targetMaxTop));
		return { minLeft, maxLeft, minTop, maxTop };
	};

	const setPosition = (left: number, top: number): void => {
		const value = bounds();
		root.style.left = `${Math.round(Math.max(value.minLeft, Math.min(value.maxLeft, left)))}px`;
		root.style.top = `${Math.round(Math.max(value.minTop, Math.min(value.maxTop, top)))}px`;
	};

	const positionAtDefault = (): void => {
		if (root.hidden) {
			return;
		}
		const targetRect = target.getBoundingClientRect();
		setPosition(
			targetRect.left + (targetRect.width - root.offsetWidth) / 2,
			targetRect.top + TARGET_TOP_GAP,
		);
	};

	const clampCurrentPosition = (): void => {
		if (root.hidden) {
			return;
		}
		if (!userPositioned) {
			positionAtDefault();
			return;
		}
		const left = Number.parseFloat(root.style.left);
		const top = Number.parseFloat(root.style.top);
		setPosition(Number.isFinite(left) ? left : 0, Number.isFinite(top) ? top : 0);
	};

	const updateStyles = (
		drawing: EngineDrawingSnapshot,
		change: {
			readonly color?: string;
			readonly size?: number;
			readonly style?: 'solid' | 'dashed' | 'dotted';
		},
	): void => {
		runtime.updateDrawingStyles(drawing.id, {
			...structuredClone(drawing.styles),
			line: {
				...structuredClone(drawing.styles.line),
				...change,
			},
		});
	};

	const performMutation = (action: (drawing: EngineDrawingSnapshot) => void): void => {
		const drawing = selectedDrawing(runtime);
		if (drawing === undefined || runtime.getDrawingMutationState() !== 'ready') {
			return;
		}
		try {
			setStatus('');
			action(drawing);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error));
		}
	};

	const render = (): void => {
		if (destroyed) {
			return;
		}
		const drawing = selectedDrawing(runtime);
		if (drawing === undefined) {
			currentId = undefined;
			root.hidden = true;
			setStatus('');
			return;
		}
		const wasHidden = root.hidden;
		root.hidden = false;
		root.dataset.drawingId = drawing.id;
		root.dataset.drawingType = drawing.type;
		if (currentId !== drawing.id) {
			currentId = drawing.id;
			setStatus('');
		}
		type.replaceChildren();
		const presentation = OVERLAY_TOOL_PRESENTATIONS[drawing.type];
		type.append(createToolbarIcon(presentation.icon));
		type.title = presentation.label;
		type.setAttribute('aria-label', presentation.label);

		const colorValue = sceneColorToHtmlHex(drawing.styles.line.color);
		colorInput.value = colorValue;
		colorIcon.style.setProperty('--baron-drawing-line-color', drawing.styles.line.color);
		lineStyle.select.value = drawing.styles.line.style;
		const widthValue = String(drawing.styles.line.size);
		if (!Array.from(lineWidth.select.options).some((option) => option.value === widthValue)) {
			const option = document.createElement('option');
			option.value = widthValue;
			option.textContent = `${widthValue}px`;
			lineWidth.select.append(option);
		}
		lineWidth.select.value = widthValue;
		const isText = TEXT_DRAWING_TYPES.has(drawing.type);
		textInput.hidden = !isText;
		textInput.value = isText ? drawing.text ?? '' : '';

		lock.replaceChildren(createToolbarIcon(drawing.locked ? 'lock' : 'lockOpen'));
		lock.setAttribute('aria-label', drawing.locked ? '解锁 Drawing' : '锁定 Drawing');
		lock.title = drawing.locked ? '解锁' : '锁定';
		lock.setAttribute('aria-pressed', String(drawing.locked));
		const busy = runtime.getDrawingMutationState() !== 'ready';
		colorInput.disabled = busy || drawing.locked;
		lineStyle.select.disabled = busy || drawing.locked;
		lineWidth.select.disabled = busy || drawing.locked;
		textInput.disabled = busy || drawing.locked;
		lock.disabled = busy;
		remove.disabled = busy || drawing.locked;
		root.setAttribute('aria-busy', String(busy));

		if (wasHidden || !userPositioned) {
			positionAtDefault();
		} else {
			clampCurrentPosition();
		}
	};

	const handleColorChange = (): void => performMutation((drawing) => {
		updateStyles(drawing, { color: htmlHexColorToSceneRgba(colorInput.value) });
	});
	const handleLineStyleChange = (): void => performMutation((drawing) => {
		updateStyles(drawing, {
			style: lineStyle.select.value as 'solid' | 'dashed' | 'dotted',
		});
	});
	const handleLineWidthChange = (): void => performMutation((drawing) => {
		updateStyles(drawing, { size: Number(lineWidth.select.value) });
	});
	const handleTextChange = (): void => performMutation((drawing) => {
		runtime.updateDrawingText(drawing.id, textInput.value);
	});
	const handleLock = (): void => performMutation((drawing) => {
		runtime.updateDrawingLocked(drawing.id, !drawing.locked);
	});
	const handleDelete = (): void => performMutation((drawing) => {
		if (drawing.locked) {
			return;
		}
		if ((options.deleteBehavior ?? 'direct') === 'request') {
			runtime.requestDrawingDelete(drawing.id);
		} else {
			runtime.removeDrawing(drawing.id);
		}
	});

	const handleDragStart = (event: PointerEvent): void => {
		if (options.draggable === false || event.button !== 0) {
			return;
		}
		const rect = root.getBoundingClientRect();
		dragging = {
			pointerId: event.pointerId,
			offsetX: event.clientX - rect.left,
			offsetY: event.clientY - rect.top,
		};
		userPositioned = true;
		root.dataset.dragging = 'true';
		grip.setPointerCapture(event.pointerId);
		event.preventDefault();
	};
	const handleDragMove = (event: PointerEvent): void => {
		if (dragging === null || dragging.pointerId !== event.pointerId) {
			return;
		}
		setPosition(event.clientX - dragging.offsetX, event.clientY - dragging.offsetY);
	};
	const finishDrag = (event: PointerEvent): void => {
		if (dragging === null || dragging.pointerId !== event.pointerId) {
			return;
		}
		if (grip.hasPointerCapture(event.pointerId)) {
			grip.releasePointerCapture(event.pointerId);
		}
		dragging = null;
		root.dataset.dragging = 'false';
	};

	colorInput.addEventListener('change', handleColorChange);
	lineStyle.select.addEventListener('change', handleLineStyleChange);
	lineWidth.select.addEventListener('change', handleLineWidthChange);
	textInput.addEventListener('change', handleTextChange);
	lock.addEventListener('click', handleLock);
	remove.addEventListener('click', handleDelete);
	grip.addEventListener('pointerdown', handleDragStart);
	grip.addEventListener('pointermove', handleDragMove);
	grip.addEventListener('pointerup', finishDrag);
	grip.addEventListener('pointercancel', finishDrag);
	const unsubscribe = runtime.subscribeDrawingChanges(render);
	const handleViewportChange = (): void => clampCurrentPosition();
	const handleFullscreenChange = (): void => {
		const portalHost = resolvePortalHost();
		if (root.parentNode !== portalHost) {
			portalHost.append(root);
		}
		clampCurrentPosition();
	};
	window.addEventListener('resize', handleViewportChange);
	window.addEventListener('scroll', handleViewportChange, true);
	document.addEventListener('fullscreenchange', handleFullscreenChange);
	const resizeObserver = typeof ResizeObserver === 'undefined'
		? null
		: new ResizeObserver(handleViewportChange);
	resizeObserver?.observe(target);
	render();

	let unregisterRuntime = (): void => {};
	const toolbar: DrawingFloatingToolbar = {
		element: root,
		resetPosition(): void {
			if (destroyed) {
				throw new Error('DRAWING_FLOATING_TOOLBAR_DESTROYED');
			}
			userPositioned = false;
			positionAtDefault();
		},
		destroy(): void {
			if (destroyed) {
				return;
			}
			destroyed = true;
			unregisterRuntime();
			unsubscribe();
			resizeObserver?.disconnect();
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange, true);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			colorInput.removeEventListener('change', handleColorChange);
			lineStyle.select.removeEventListener('change', handleLineStyleChange);
			lineWidth.select.removeEventListener('change', handleLineWidthChange);
			textInput.removeEventListener('change', handleTextChange);
			lock.removeEventListener('click', handleLock);
			remove.removeEventListener('click', handleDelete);
			grip.removeEventListener('pointerdown', handleDragStart);
			grip.removeEventListener('pointermove', handleDragMove);
			grip.removeEventListener('pointerup', finishDrag);
			grip.removeEventListener('pointercancel', finishDrag);
			root.remove();
			style.remove();
		},
	};
	unregisterRuntime = registerRuntimeTeardown(runtime, () => toolbar.destroy());
	return toolbar;
}
