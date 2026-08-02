import { serializeCanonicalScene } from '@baron1996/kline-scene-schema';
import { SUPPORTED_OVERLAYS } from '@baron1996/klinecharts-adapter';

import { registerRuntimeTeardown } from '../lifecycle.js';
import type { KLineSceneRuntime } from '../runtime.js';
import type {
	StandardToolbar,
	StandardToolbarOptions,
	SupportedOverlayType,
} from '../types.js';
import { createToolbarIcon } from './toolbar-icons.js';
import { STANDARD_TOOLBAR_STYLES } from './standard-toolbar-styles.js';
import {
	OVERLAY_TOOL_PRESENTATIONS,
	TEXT_OVERLAY_TYPES,
	TOOLBAR_ACTIONS,
	TOOLBAR_GROUPS,
	type ToolbarActionPresentation,
	type ToolbarToolPresentation,
} from './toolbar-tools.js';

let nextToolbarId = 1;

interface ToolbarButton {
	readonly element: HTMLButtonElement;
	readonly cleanup: () => void;
}

interface ToolbarTooltip {
	readonly bind: (
		button: HTMLButtonElement,
		label: string,
		type: string,
	) => () => void;
	readonly hide: () => void;
	readonly destroy: () => void;
}

/** 将 HTML color 控件的 #RRGGBB 边界值归一化为 Scene v1 唯一的 rgba 表示。 */
function htmlHexColorToSceneRgba(value: string): string {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
	if (match === null) {
		throw new TypeError(`Invalid HTML color value: ${value}`);
	}
	const red = Number.parseInt(match[1]!, 16);
	const green = Number.parseInt(match[2]!, 16);
	const blue = Number.parseInt(match[3]!, 16);
	return `rgba(${red}, ${green}, ${blue}, 1)`;
}

function createIconButton(
	presentation: ToolbarToolPresentation | ToolbarActionPresentation,
	action: () => void,
): ToolbarButton {
	const element = document.createElement('button');
	element.type = 'button';
	element.className = 'baron-kline-toolbar__button';
	element.setAttribute('aria-label', presentation.label);
	element.append(createToolbarIcon(presentation.icon));
	element.addEventListener('click', action);
	return {
		element,
		cleanup: () => element.removeEventListener('click', action),
	};
}

function createTooltip(
	viewport: HTMLElement,
	tooltipId: string,
): ToolbarTooltip {
	const element = document.createElement('div');
	element.id = tooltipId;
	element.className = 'baron-kline-toolbar-tooltip';
	element.setAttribute('role', 'tooltip');
	element.hidden = true;
	const name = document.createElement('strong');
	const type = document.createElement('code');
	element.append(name, type);
	document.body.append(element);

	let anchor: HTMLButtonElement | undefined;
	const position = (button: HTMLButtonElement): void => {
		const viewportPadding = 8;
		const tooltipGap = 8;
		const buttonRect = button.getBoundingClientRect();
		const viewportRect = viewport.getBoundingClientRect();
		const tooltipRect = element.getBoundingClientRect();
		const centeredLeft = buttonRect.left + (buttonRect.width - tooltipRect.width) / 2;
		const minimumLeft = Math.max(
			viewportRect.left + viewportPadding,
			viewportPadding,
		);
		const maximumLeft = Math.min(
			viewportRect.right - tooltipRect.width - viewportPadding,
			window.innerWidth - tooltipRect.width - viewportPadding,
		);
		const left = Math.max(
			minimumLeft,
			Math.min(centeredLeft, maximumLeft),
		);
		element.style.left = `${Math.round(left)}px`;
		element.style.top = `${Math.round(buttonRect.bottom + tooltipGap)}px`;
	};

	const hide = (): void => {
		anchor?.removeAttribute('aria-describedby');
		element.classList.remove('baron-kline-toolbar-tooltip--visible');
		element.hidden = true;
		anchor = undefined;
	};

	const show = (
		button: HTMLButtonElement,
		label: string,
		tooltipType: string,
	): void => {
		anchor?.removeAttribute('aria-describedby');
		anchor = button;
		name.textContent = label;
		type.textContent = tooltipType;
		element.hidden = false;
		button.setAttribute('aria-describedby', tooltipId);
		position(button);
		element.classList.add('baron-kline-toolbar-tooltip--visible');
	};

	const bind = (
		button: HTMLButtonElement,
		label: string,
		tooltipType: string,
	): (() => void) => {
		const handleMouseEnter = (): void => show(button, label, tooltipType);
		const handleMouseLeave = (): void => {
			if (document.activeElement !== button) {
				hide();
			}
		};
		const handleFocus = (): void => show(button, label, tooltipType);
		const handleBlur = (): void => hide();
		button.addEventListener('mouseenter', handleMouseEnter);
		button.addEventListener('mouseleave', handleMouseLeave);
		button.addEventListener('focus', handleFocus);
		button.addEventListener('blur', handleBlur);
		return () => {
			button.removeEventListener('mouseenter', handleMouseEnter);
			button.removeEventListener('mouseleave', handleMouseLeave);
			button.removeEventListener('focus', handleFocus);
			button.removeEventListener('blur', handleBlur);
			if (anchor === button) {
				hide();
			}
		};
	};

	const handleViewportChange = (): void => hide();
	viewport.addEventListener('scroll', handleViewportChange);
	window.addEventListener('resize', handleViewportChange);
	window.addEventListener('scroll', handleViewportChange, true);

	return {
		bind,
		hide,
		destroy(): void {
			hide();
			viewport.removeEventListener('scroll', handleViewportChange);
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange, true);
			element.remove();
		},
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

function setActiveOverlayButton(
	buttons: readonly HTMLButtonElement[],
	activeButton: HTMLButtonElement,
): void {
	for (const button of buttons) {
		button.setAttribute('aria-pressed', String(button === activeButton));
	}
}

function createSelectControl(
	labelText: string,
	action: string,
	values: readonly { readonly value: string; readonly label: string }[],
): { readonly label: HTMLLabelElement; readonly select: HTMLSelectElement } {
	const label = document.createElement('label');
	label.className = 'baron-kline-toolbar__control';
	const text = document.createElement('span');
	text.textContent = labelText;
	const select = document.createElement('select');
	select.dataset.action = action;
	select.setAttribute('aria-label', labelText);
	for (const value of values) {
		const option = document.createElement('option');
		option.value = value.value;
		option.textContent = value.label;
		select.append(option);
	}
	label.append(text, select);
	return { label, select };
}

function createInputControl(
	labelText: string,
	action: string,
	type: 'color' | 'number',
): { readonly label: HTMLLabelElement; readonly input: HTMLInputElement } {
	const label = document.createElement('label');
	label.className = 'baron-kline-toolbar__control';
	const text = document.createElement('span');
	text.textContent = labelText;
	const input = document.createElement('input');
	input.type = type;
	input.dataset.action = action;
	input.setAttribute('aria-label', labelText);
	label.append(text, input);
	return { label, input };
}

/** 创建不含撤销/重做的标准离线编辑工具栏。 */
export function createStandardToolbar(
	container: HTMLElement,
	runtime: KLineSceneRuntime,
	options: StandardToolbarOptions = {},
): StandardToolbar {
	const toolbarId = nextToolbarId++;
	const root = document.createElement('div');
	root.className = 'baron-kline-toolbar';
	root.setAttribute('role', 'toolbar');
	root.setAttribute('aria-label', 'K 线标注工具');
	const style = document.createElement('style');
	style.dataset.baronToolbarStyles = '';
	style.textContent = STANDARD_TOOLBAR_STYLES;
	const viewport = document.createElement('div');
	viewport.className = 'baron-kline-toolbar__viewport';
	const content = document.createElement('div');
	content.className = 'baron-kline-toolbar__content';
	viewport.append(content);
	root.append(style, viewport);

	const tooltip = createTooltip(
		viewport,
		`baron-kline-toolbar-tooltip-${toolbarId}`,
	);
	const cleanupCallbacks: Array<() => void> = [];
	const overlayButtons: HTMLButtonElement[] = [];
	const textInput = document.createElement('input');
	textInput.type = 'text';
	textInput.className = 'baron-kline-toolbar__text-input';
	textInput.dataset.action = 'overlay-text';
	textInput.setAttribute('aria-label', '标注文本');
	textInput.placeholder = '输入标注文本';
	const scaleControl = createSelectControl('价格轴', 'price-scale', [
		{ value: 'linear', label: '线性' },
		{ value: 'logarithmic', label: '对数' },
	]);
	const lineStyleControl = createSelectControl('线型', 'line-style', [
		{ value: 'solid', label: '实线' },
		{ value: 'dashed', label: '虚线' },
	]);
	const lineSizeControl = createInputControl('线宽', 'line-size', 'number');
	lineSizeControl.input.min = '0.5';
	lineSizeControl.input.max = '10';
	lineSizeControl.input.step = '0.5';
	lineSizeControl.input.value = '1';
	const lineColorControl = createInputControl('线色', 'line-color', 'color');
	lineColorControl.input.value = '#2962ff';
	const primaryAxis = runtime.getScene().panes
		.find((pane) => pane.kind === 'candle')
		?.yAxes.find((axis) => axis.role === 'primary');
	scaleControl.select.value = primaryAxis?.scale ?? 'linear';

	const applySelectedLineStyle = (change: {
		readonly color?: string;
		readonly size?: number;
		readonly style?: 'solid' | 'dashed';
	}): void => {
		const id = runtime.getSelectedOverlayId();
		const overlay = id === undefined ? undefined : runtime.getOverlay(id);
		if (id === undefined || overlay === undefined) {
			return;
		}
		runtime.updateOverlayStyles(id, {
			...structuredClone(overlay.styles),
			line: {
				...structuredClone(overlay.styles.line),
				...change,
			},
		});
	};
	const handleScaleChange = async (): Promise<void> => {
		await runtime.setPriceScale(scaleControl.select.value as 'linear' | 'logarithmic');
	};
	const handleLineStyleChange = (): void => {
		applySelectedLineStyle({
			style: lineStyleControl.select.value as 'solid' | 'dashed',
		});
	};
	const handleLineSizeChange = (): void => {
		applySelectedLineStyle({ size: lineSizeControl.input.valueAsNumber });
	};
	const handleLineColorChange = (): void => {
		applySelectedLineStyle({ color: htmlHexColorToSceneRgba(lineColorControl.input.value) });
	};
	scaleControl.select.addEventListener('change', handleScaleChange);
	lineStyleControl.select.addEventListener('change', handleLineStyleChange);
	lineSizeControl.input.addEventListener('change', handleLineSizeChange);
	lineColorControl.input.addEventListener('change', handleLineColorChange);
	cleanupCallbacks.push(
		() => scaleControl.select.removeEventListener('change', handleScaleChange),
		() => lineStyleControl.select.removeEventListener('change', handleLineStyleChange),
		() => lineSizeControl.input.removeEventListener('change', handleLineSizeChange),
		() => lineColorControl.input.removeEventListener('change', handleLineColorChange),
	);

	for (const group of TOOLBAR_GROUPS) {
		const groupElement = document.createElement('div');
		groupElement.className = 'baron-kline-toolbar__group';
		groupElement.dataset.toolbarGroup = group.id;
		groupElement.setAttribute('role', 'group');
		groupElement.setAttribute('aria-label', group.label);

		if (group.id === 'edit') {
			groupElement.append(
				scaleControl.label,
				lineStyleControl.label,
				lineSizeControl.label,
				lineColorControl.label,
			);
		} else if (group.id === 'action') {
			for (const presentation of TOOLBAR_ACTIONS) {
				const action = presentation.action === 'delete'
					? (): void => {
							const id = runtime.getSelectedOverlayId();
							if (id === undefined) {
								return;
							}
							const overlay = runtime.getOverlay(id);
							if (overlay !== undefined && !overlay.locked) {
								if ((options.deleteBehavior ?? 'direct') === 'request') {
									runtime.requestOverlayDelete(id);
								} else {
									runtime.removeOverlay(id);
								}
							}
						}
					: (): void => {
							downloadScene(
								runtime,
								options.downloadFileName ?? 'kline-scene.json',
							);
						};
				const button = createIconButton(presentation, action);
				button.element.dataset.action = presentation.action;
				groupElement.append(button.element);
				cleanupCallbacks.push(
					button.cleanup,
					tooltip.bind(
						button.element,
						presentation.label,
						presentation.action,
					),
				);
			}
			for (const hostAction of options.hostActions ?? []) {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'baron-kline-toolbar__button baron-kline-toolbar__host-action';
				button.dataset.hostAction = hostAction.actionId;
				button.textContent = hostAction.label;
				button.setAttribute('aria-label', hostAction.label);
				const action = (): void => runtime.requestHostAction(
					hostAction.actionId,
					runtime.getSelectedOverlayId() ?? null,
				);
				button.addEventListener('click', action);
				groupElement.append(button);
				cleanupCallbacks.push(() => button.removeEventListener('click', action));
			}
		} else {
			for (const overlayType of SUPPORTED_OVERLAYS) {
				const presentation = OVERLAY_TOOL_PRESENTATIONS[overlayType];
				if (presentation.group !== group.id) {
					continue;
				}
				let buttonElement: HTMLButtonElement;
				const action = (): void => {
					runtime.startOverlayDrawing(
						overlayType,
						TEXT_OVERLAY_TYPES.has(overlayType)
							? { text: textInput.value }
							: {},
					);
					setActiveOverlayButton(overlayButtons, buttonElement);
					tooltip.hide();
				};
				const button = createIconButton(presentation, action);
				buttonElement = button.element;
				buttonElement.dataset.overlayType = overlayType;
				buttonElement.setAttribute('aria-pressed', 'false');
				overlayButtons.push(buttonElement);
				groupElement.append(buttonElement);
				cleanupCallbacks.push(
					button.cleanup,
					tooltip.bind(
						buttonElement,
						presentation.label,
						overlayType satisfies SupportedOverlayType,
					),
				);
			}
		}

		content.append(groupElement);
	}

	const textField = document.createElement('label');
	textField.className = 'baron-kline-toolbar__text-field';
	const textLabel = document.createElement('span');
	textLabel.className = 'baron-kline-toolbar__visually-hidden';
	textLabel.textContent = '标注文本';
	textField.append(textLabel, textInput);
	content.append(textField);

	container.append(root);
	let destroyed = false;
	let unregisterRuntime = (): void => {};
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
			tooltip.destroy();
			root.remove();
		},
	};
	unregisterRuntime = registerRuntimeTeardown(runtime, () => toolbar.destroy());
	return toolbar;
}
