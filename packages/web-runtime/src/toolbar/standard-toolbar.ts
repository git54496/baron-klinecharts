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

interface HostActionControl {
	readonly button: HTMLButtonElement;
	readonly error: HTMLSpanElement;
}

function applyHostActionState(
	control: HostActionControl,
	state: {
		readonly pressed?: boolean;
		readonly disabled?: boolean;
		readonly pending?: boolean;
		readonly errorMessage?: string | null;
	},
): void {
	if (state.pressed !== undefined) {
		control.button.setAttribute('aria-pressed', String(state.pressed));
	}
	if (state.disabled !== undefined) {
		control.button.disabled = state.disabled;
	}
	if (state.pending !== undefined) {
		control.button.setAttribute('aria-busy', String(state.pending));
	}
	if ('errorMessage' in state) {
		const message = state.errorMessage?.trim() ?? '';
		control.error.textContent = message;
		control.error.hidden = message.length === 0;
		if (message.length === 0) {
			control.button.removeAttribute('aria-errormessage');
		} else {
			control.button.setAttribute('aria-errormessage', control.error.id);
		}
	}
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

/** 创建不含撤销/重做的标准离线编辑工具栏。 */
export function createStandardToolbar(
	container: HTMLElement,
	runtime: StandardDrawingRuntime,
	options: StandardToolbarOptions = {},
): StandardToolbar {
	const descriptor = runtime.getRuntimeCapabilityDescriptor(
		options.hostActions === undefined ? {} : { hostActions: options.hostActions },
	);
	const hostActionIds = new Set<string>();
	for (const hostAction of descriptor.hostActions) {
		if (hostActionIds.has(hostAction.actionId)) {
			throw new TypeError(
				`STANDARD_TOOLBAR_DUPLICATE_HOST_ACTION: ${hostAction.actionId}`,
			);
		}
		hostActionIds.add(hostAction.actionId);
	}
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
	const hostActionControls = new Map<string, HostActionControl>();
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
	scaleControl.select.value = descriptor.valueAxis.activeScale;

	const handleScaleChange = async (): Promise<void> => {
		await runtime.setValueAxisScale(scaleControl.select.value as 'linear' | 'logarithmic');
	};
	scaleControl.select.addEventListener('change', handleScaleChange);
	cleanupCallbacks.push(
		() => scaleControl.select.removeEventListener('change', handleScaleChange),
	);

	const editLabels: HTMLLabelElement[] = [];
	if (descriptor.valueAxis.mutable) {
		editLabels.push(scaleControl.label);
	}
	if (
		mainSeriesControl !== null &&
		options.mainSeriesPresentationControl !== 'hidden'
	) {
		editLabels.push(mainSeriesControl.label);
	}
	// 主序列切换监听与控件放置位置无关，统一注册一次。
	if (
		mainSeries !== null &&
		mainSeriesControl !== null &&
		options.mainSeriesPresentationControl !== 'hidden'
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
	const drawableTypes = (descriptor.drawingTypes.length === 0
		? SUPPORTED_OVERLAYS
		: descriptor.drawingTypes) as readonly SupportedOverlayType[];
	for (const group of TOOLBAR_GROUPS) {
		const groupElement = document.createElement('div');
		groupElement.className = 'baron-kline-toolbar__group';
		groupElement.dataset.toolbarGroup = group.id;
		groupElement.setAttribute('role', 'group');
		groupElement.setAttribute('aria-label', group.label);

		if (group.id === 'edit') {
			groupElement.append(...editLabels);
		} else if (group.id === 'action') {
			for (const presentation of TOOLBAR_ACTIONS) {
				const action = presentation.action === 'clear-all'
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
				button.setAttribute('aria-pressed', String(hostAction.pressed ?? false));
				button.setAttribute('aria-busy', String(hostAction.pending ?? false));
				button.disabled = hostAction.disabled ?? false;
				const error = document.createElement('span');
				error.id = `baron-kline-toolbar-host-action-error-${toolbarId}-${hostActionControls.size}`;
				error.className = 'baron-kline-toolbar__host-action-error';
				error.setAttribute('role', 'alert');
				error.setAttribute('aria-live', 'assertive');
				const control = { button, error };
				hostActionControls.set(hostAction.actionId, control);
				applyHostActionState(control, {
					errorMessage: hostAction.errorMessage ?? null,
				});
				const action = (): void => runtime.requestHostAction(
					hostAction.actionId,
					runtime.getSelectedDrawingId() ?? null,
				);
				button.addEventListener('click', action);
				groupElement.append(button, error);
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
		setHostActionState(actionId, state): void {
			if (destroyed) {
				throw new Error('STANDARD_TOOLBAR_DESTROYED');
			}
			const control = hostActionControls.get(actionId);
			if (control === undefined) {
				throw new TypeError(`STANDARD_TOOLBAR_UNKNOWN_HOST_ACTION: ${actionId}`);
			}
			applyHostActionState(control, state);
		},
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
