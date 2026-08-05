import { SUPPORTED_OVERLAYS } from '@baron1996/klinecharts-adapter';

import { registerRuntimeTeardown } from '../lifecycle.js';
import type {
	DrawingRuntimeCapability,
	RuntimeAuxiliaryCapability,
} from '../drawing/capabilities.js';
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

type StandardDrawingRuntime = DrawingRuntimeCapability & RuntimeAuxiliaryCapability;

function downloadArtifact(
	runtime: StandardDrawingRuntime,
	fileName: string,
): void {
	const artifact = runtime.exportArtifact(fileName);
	const blob = new Blob([artifact.bytes as unknown as BlobPart], { type: artifact.mediaType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	URL.revokeObjectURL(url);
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
	runtime: StandardDrawingRuntime,
	options: StandardToolbarOptions = {},
): StandardToolbar {
	const descriptor = runtime.getRuntimeCapabilityDescriptor(
		options.hostActions === undefined ? {} : { hostActions: options.hostActions },
	);
	const defaultFileName = options.downloadFileName
		?? descriptor.exportArtifact.defaultFileName;
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
	scaleControl.select.hidden = !descriptor.valueAxis.mutable || descriptor.valueAxis.supportedScales.length < 2;
	for (const child of Array.from(scaleControl.select.children)) {
		child.remove();
	}
	for (const scale of descriptor.valueAxis.supportedScales) {
		const option = document.createElement('option');
		option.value = scale;
		option.textContent = scale === 'linear' ? '线性' : '对数';
		scaleControl.select.append(option);
	}
	const lineStyleControl = createSelectControl('线型', 'line-style', [
		{ value: 'solid', label: '实线' },
		{ value: 'dashed', label: '虚线' },
		{ value: 'dotted', label: '点线' },
	]);
	const mainSeries = descriptor.mainSeriesPresentation;
	const mainSeriesOptions = mainSeries === null
		? []
		: mainSeries.presentations.map((presentation) => ({
				value: presentation.type,
				label: presentationLabel(presentation.type),
				presentation: structuredClone(presentation),
			}));
	const mainSeriesControl = mainSeries === null
		? null
		: createSelectControl(
				'主序列',
				'main-series',
				mainSeriesOptions,
			);
	if (mainSeries !== null && mainSeriesControl !== null) {
		mainSeriesControl.select.value = mainSeries.activeType;
	}
	const lineSizeControl = createInputControl('线宽', 'line-size', 'number');
	lineSizeControl.input.min = '0.5';
	lineSizeControl.input.max = '10';
	lineSizeControl.input.step = '0.5';
	lineSizeControl.input.value = '1';
	const lineColorControl = createInputControl('线色', 'line-color', 'color');
	lineColorControl.input.value = '#2962ff';
	scaleControl.select.value = descriptor.valueAxis.activeScale;

	const applySelectedLineStyle = (change: {
		readonly color?: string;
		readonly size?: number;
		readonly style?: 'solid' | 'dashed' | 'dotted';
	}): void => {
		const id = runtime.getSelectedDrawingId();
		const overlay = id === undefined ? undefined : runtime.getDrawing(id);
		if (id === undefined || overlay === undefined) {
			return;
		}
		runtime.updateDrawingStyles(id, {
			...structuredClone(overlay.styles),
			line: {
				...structuredClone(overlay.styles.line),
				...change,
			},
		});
	};
	const handleScaleChange = async (): Promise<void> => {
		await runtime.setValueAxisScale(scaleControl.select.value as 'linear' | 'logarithmic');
	};
	const handleLineStyleChange = (): void => {
		applySelectedLineStyle({
			style: lineStyleControl.select.value as 'solid' | 'dashed' | 'dotted',
		});
	};
	const handleLineSizeChange = (): void => {
		applySelectedLineStyle({ size: lineSizeControl.input.valueAsNumber });
	};
	const handleLineColorChange = (): void => {
		applySelectedLineStyle({ color: htmlHexColorToSceneRgba(lineColorControl.input.value) });
	};
	const handleTextChange = (): void => {
		const id = runtime.getSelectedDrawingId();
		const drawing = id === undefined ? undefined : runtime.getDrawing(id);
		if (
			id === undefined ||
			drawing === undefined ||
			!(
				drawing.type === 'simpleTag' ||
				drawing.type === 'simpleAnnotation' ||
				drawing.type === 'callout' ||
				drawing.type === 'text'
			)
		) {
			return;
		}
		runtime.updateDrawingText(id, textInput.value);
	};
	scaleControl.select.addEventListener('change', handleScaleChange);
	lineStyleControl.select.addEventListener('change', handleLineStyleChange);
	lineSizeControl.input.addEventListener('change', handleLineSizeChange);
	lineColorControl.input.addEventListener('change', handleLineColorChange);
	textInput.addEventListener('change', handleTextChange);
	cleanupCallbacks.push(
		() => scaleControl.select.removeEventListener('change', handleScaleChange),
		() => lineStyleControl.select.removeEventListener('change', handleLineStyleChange),
		() => lineSizeControl.input.removeEventListener('change', handleLineSizeChange),
		() => lineColorControl.input.removeEventListener('change', handleLineColorChange),
		() => textInput.removeEventListener('change', handleTextChange),
	);

	const useContextMenu = options.editControlsPlacement === 'context-menu';
	if (useContextMenu && options.contextMenuTarget === undefined) {
		throw new TypeError(
			'STANDARD_TOOLBAR_CONTEXT_MENU_TARGET_REQUIRED: ' +
			'editControlsPlacement "context-menu" requires contextMenuTarget.',
		);
	}
	const contextMenuTarget = options.contextMenuTarget;
	const editLabels: HTMLLabelElement[] = [
		scaleControl.label,
		lineStyleControl.label,
		lineSizeControl.label,
		lineColorControl.label,
	];
	if (
		mainSeriesControl !== null &&
		options.mainSeriesPresentationControl === 'enabled'
	) {
		editLabels.push(mainSeriesControl.label);
	}
	// 主序列切换监听与控件放置位置无关，统一注册一次。
	if (
		mainSeries !== null &&
		mainSeriesControl !== null &&
		options.mainSeriesPresentationControl === 'enabled'
	) {
		const handleMainSeriesChange = (): void => {
			const presentation = mainSeries?.presentations.find(
				(candidate) => candidate.type === mainSeriesControl.select.value,
			);
			if (presentation === undefined) {
				return;
			}
			const result = runtime.setMainSeriesPresentation(presentation);
			mainSeriesControl.select.value = result.activeType;
		};
		mainSeriesControl.select.addEventListener(
			'change',
			handleMainSeriesChange,
		);
		cleanupCallbacks.push(() =>
			mainSeriesControl.select.removeEventListener(
				'change',
				handleMainSeriesChange,
			),
		);
	}
	if (useContextMenu && contextMenuTarget !== undefined) {
		const menu = document.createElement('div');
		menu.className = 'baron-kline-context-menu';
		menu.setAttribute('role', 'group');
		menu.setAttribute('aria-label', '坐标与样式');
		menu.hidden = true;
		menu.append(...editLabels);
		document.body.append(menu);

		const hideContextMenu = (): void => {
			menu.hidden = true;
			menu.classList.remove('baron-kline-context-menu--visible');
		};
		const handleContextMenu = (event: MouseEvent): void => {
			const rect = contextMenuTarget.getBoundingClientRect();
			const point = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
			// 只有图表空白处右键才弹出编辑菜单；命中 Drawing 时不接管。
			if (runtime.hitTestDrawing(point) !== null) {
				return;
			}
			event.preventDefault();
			menu.hidden = false;
			menu.classList.add('baron-kline-context-menu--visible');
			const gap = 8;
			menu.style.left = `${Math.max(
				0,
				Math.min(
					event.clientX,
					window.innerWidth - menu.offsetWidth - gap,
				),
			)}px`;
			menu.style.top = `${Math.max(
				0,
				Math.min(
					event.clientY,
					window.innerHeight - menu.offsetHeight - gap,
				),
			)}px`;
		};
		const handlePointerDown = (event: PointerEvent): void => {
			if (!menu.contains(event.target as Node)) {
				hideContextMenu();
			}
		};
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				hideContextMenu();
			}
		};
		contextMenuTarget.addEventListener('contextmenu', handleContextMenu);
		document.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('resize', hideContextMenu);
		window.addEventListener('scroll', hideContextMenu, true);
		cleanupCallbacks.push(() => {
			contextMenuTarget.removeEventListener('contextmenu', handleContextMenu);
			document.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('resize', hideContextMenu);
			window.removeEventListener('scroll', hideContextMenu, true);
			menu.remove();
		});
	}

	const drawableTypes = (descriptor.drawingTypes.length === 0
		? SUPPORTED_OVERLAYS
		: descriptor.drawingTypes) as readonly SupportedOverlayType[];
	for (const group of TOOLBAR_GROUPS) {
		if (group.id === 'edit' && useContextMenu) {
			continue;
		}
		const groupElement = document.createElement('div');
		groupElement.className = 'baron-kline-toolbar__group';
		groupElement.dataset.toolbarGroup = group.id;
		groupElement.setAttribute('role', 'group');
		groupElement.setAttribute('aria-label', group.label);

		if (group.id === 'edit') {
			groupElement.append(...editLabels);
		} else if (group.id === 'action') {
			for (const presentation of TOOLBAR_ACTIONS) {
				const action = presentation.action === 'delete'
					? (): void => {
							const id = runtime.getSelectedDrawingId();
							if (id === undefined) {
								return;
							}
							const overlay = runtime.getDrawing(id);
							if (overlay !== undefined && !overlay.locked) {
								if ((options.deleteBehavior ?? 'direct') === 'request') {
									runtime.requestDrawingDelete(id);
								} else {
									runtime.removeDrawing(id);
								}
							}
						}
					: presentation.action === 'clear-all'
						? (): void => {
								// 清空全部 Drawing；锁定的 Drawing 保持既有“不接受 mutation”契约。
								for (const drawing of runtime.listDrawings()) {
									if (!drawing.locked) {
										runtime.removeDrawing(drawing.id);
									}
								}
								runtime.selectDrawing(null);
							}
					: (): void => {
							downloadArtifact(
								runtime,
								defaultFileName,
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
					runtime.getSelectedDrawingId() ?? null,
				);
				button.addEventListener('click', action);
				groupElement.append(button);
				cleanupCallbacks.push(() => button.removeEventListener('click', action));
			}
		} else {
			for (const overlayType of drawableTypes) {
				const presentation = OVERLAY_TOOL_PRESENTATIONS[overlayType];
				if (presentation.group !== group.id) {
					continue;
				}
				let buttonElement: HTMLButtonElement;
				const action = (): void => {
					runtime.startDrawing(
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

function presentationLabel(type: string): string {
	switch (type) {
		case 'candle_solid':
			return '实心蜡烛';
		case 'candle_stroke':
			return '描边蜡烛';
		case 'candle_up_stroke':
			return '上涨描边';
		case 'candle_down_stroke':
			return '下跌描边';
		case 'ohlc':
			return 'OHLC';
		case 'area':
			return '收盘价折线';
		default:
			return type;
	}
}
