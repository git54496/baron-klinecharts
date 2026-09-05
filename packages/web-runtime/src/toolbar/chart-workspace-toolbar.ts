import { SUPPORTED_OVERLAYS } from '@baron1996/klinecharts-adapter';

import type {
	DisplayTimezoneRuntimeCapability,
	DrawingRuntimeCapability,
	MainIndicatorRuntimeCapability,
	RuntimeAuxiliaryCapability,
} from '../drawing/capabilities.js';
import type { HostActionDescriptor } from '../drawing/runtime-capability-descriptor.js';
import type { WorkspaceRuntimeListener } from '../drawing/workspace-events.js';
import { MAIN_PANE_INDICATOR_PRESETS } from '../indicator-presentation.js';
import { registerRuntimeTeardown } from '../lifecycle.js';
import type { SupportedOverlayType } from '../types.js';
import { CHART_WORKSPACE_TOOLBAR_STYLES } from './chart-workspace-toolbar-styles.js';
import { createToolbarIcon, type ToolbarIconName } from './toolbar-icons.js';
import {
	OVERLAY_TOOL_PRESENTATIONS,
	TEXT_OVERLAY_TYPES,
	TOOLBAR_GROUPS,
} from './toolbar-tools.js';

type ChartWorkspaceRuntime = DrawingRuntimeCapability &
	RuntimeAuxiliaryCapability &
	MainIndicatorRuntimeCapability &
	DisplayTimezoneRuntimeCapability;

export interface WorkspaceToolbarTimezoneChoice {
	/** 宿主持久化使用的稳定语义值，例如 instrument、local、utc。 */
	readonly value: string;
	readonly label: string;
	/** 实际交给图表引擎的 IANA 时区。 */
	readonly timezone: string;
}

export interface ChartWorkspaceToolbarOptions {
	/** 顶部直接展示的周期动作；点击后仍通过 host-action-requested 交给宿主取数。 */
	readonly periodActions?: readonly HostActionDescriptor[];
	/** 收纳进设置面板的宿主动作用于前复权等业务配置。 */
	readonly settingsHostActions?: readonly HostActionDescriptor[];
	readonly displayTimezoneChoices?: readonly WorkspaceToolbarTimezoneChoice[];
	readonly activeDisplayTimezoneValue?: string;
	readonly onDisplayTimezoneChange?: (
		choice: WorkspaceToolbarTimezoneChoice,
	) => void;
	readonly fullscreenTarget?: HTMLElement;
	readonly fullscreenControl?: 'hidden' | 'enabled';
}

export interface ChartWorkspaceToolbarContainers {
	readonly top: HTMLElement;
	readonly left: HTMLElement;
}

export interface ChartWorkspaceToolbar {
	readonly topElement: HTMLElement;
	readonly leftElement: HTMLElement;
	setDataActionsDisabled(disabled: boolean): void;
	setDrawingActionsDisabled(disabled: boolean): void;
	setHostActionState(
		actionId: string,
		state: {
			readonly pressed?: boolean;
			readonly disabled?: boolean;
			readonly pending?: boolean;
			readonly errorMessage?: string | null;
		},
	): void;
	setDisplayTimezoneChoice(value: string): void;
	destroy(): void;
}

interface RuntimeStateAware {
	getRuntimeState(): 'empty' | 'loading-history' | 'error' | 'ready';
	subscribeRuntimeState(
		listener: (state: 'empty' | 'loading-history' | 'error' | 'ready') => void,
	): () => void;
}

interface WorkspaceEventAware {
	subscribe(listener: WorkspaceRuntimeListener): () => void;
}

interface HostActionControl {
	readonly button: HTMLButtonElement;
	readonly error: HTMLDivElement;
}

interface PopoverControl {
	readonly element: HTMLDivElement;
	readonly toggle: () => void;
	readonly close: () => void;
	readonly destroy: () => void;
}

let nextWorkspaceToolbarId = 1;

function resolvePortalHost(anchor: HTMLElement): ParentNode {
	const fullscreenElement = document.fullscreenElement;
	return fullscreenElement !== null && fullscreenElement.contains(anchor)
		? fullscreenElement
		: document.body;
}

function runtimeStateCapability(
	runtime: ChartWorkspaceRuntime,
): RuntimeStateAware | undefined {
	const candidate = runtime as ChartWorkspaceRuntime &
		Partial<RuntimeStateAware>;
	return typeof candidate.getRuntimeState === 'function' &&
		typeof candidate.subscribeRuntimeState === 'function'
		? (candidate as RuntimeStateAware)
		: undefined;
}

function workspaceEventCapability(
	runtime: ChartWorkspaceRuntime,
): WorkspaceEventAware | undefined {
	const candidate = runtime as ChartWorkspaceRuntime & Partial<WorkspaceEventAware>;
	return typeof candidate.subscribe === 'function'
		? candidate as WorkspaceEventAware
		: undefined;
}

function createButton(options: {
	readonly label: string;
	readonly text?: string;
	readonly icon?: ToolbarIconName;
	readonly className?: string;
}): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = `baron-chart-workspace-toolbar__button${
		options.className === undefined ? '' : ` ${options.className}`
	}`;
	button.setAttribute('aria-label', options.label);
	if (options.icon !== undefined) {
		button.append(createToolbarIcon(options.icon));
	}
	if (options.text !== undefined) {
		button.append(document.createTextNode(options.text));
	}
	return button;
}

function createSection(label: string, end = false): HTMLDivElement {
	const section = document.createElement('div');
	section.className = `baron-chart-workspace-toolbar__section${
		end ? ' baron-chart-workspace-toolbar__section--end' : ''
	}`;
	section.setAttribute('role', 'group');
	section.setAttribute('aria-label', label);
	return section;
}

function createSettingsRow(
	labelText: string,
	settingName: string,
): {
	readonly row: HTMLDivElement;
	readonly control: HTMLDivElement;
} {
	const row = document.createElement('div');
	row.className = 'baron-chart-workspace-popover__row';
	row.dataset.settingName = settingName;
	const label = document.createElement('span');
	label.className = 'baron-chart-workspace-popover__label';
	label.textContent = labelText;
	const control = document.createElement('div');
	control.className = 'baron-chart-workspace-popover__control';
	row.append(label, control);
	return { row, control };
}

function createSegmentedControl(
	label: string,
	action: string,
): HTMLDivElement {
	const control = document.createElement('div');
	control.className = 'baron-chart-workspace-popover__segmented';
	control.dataset.action = action;
	control.setAttribute('role', 'group');
	control.setAttribute('aria-label', label);
	return control;
}

function selectSegment<Value extends string>(
	buttons: ReadonlyMap<Value, HTMLButtonElement>,
	activeValue: Value,
): void {
	for (const [value, button] of buttons) {
		button.setAttribute('aria-pressed', String(value === activeValue));
	}
}

function createPopover(
	button: HTMLButtonElement,
	id: string,
	cleanupCallbacks: Array<() => void>,
): PopoverControl {
	const element = document.createElement('div');
	element.id = id;
	element.className = 'baron-chart-workspace-popover';
	element.hidden = true;
	button.setAttribute('aria-controls', id);
	button.setAttribute('aria-expanded', 'false');
	resolvePortalHost(button).append(element);

	const position = (): void => {
		const anchor = button.getBoundingClientRect();
		const bounds = element.getBoundingClientRect();
		const left = Math.min(
			Math.max(8, anchor.left),
			Math.max(8, window.innerWidth - bounds.width - 8),
		);
		element.style.left = `${Math.round(left)}px`;
		element.style.top = `${Math.round(anchor.bottom + 7)}px`;
	};
	const close = (): void => {
		button.setAttribute('aria-expanded', 'false');
		element.classList.remove('baron-chart-workspace-popover--open');
		element.hidden = true;
	};
	const open = (): void => {
		const portalHost = resolvePortalHost(button);
		if (element.parentNode !== portalHost) {
			portalHost.append(element);
		}
		element.hidden = false;
		position();
		button.setAttribute('aria-expanded', 'true');
		requestAnimationFrame(() => {
			if (!element.hidden) {
				element.classList.add('baron-chart-workspace-popover--open');
			}
		});
	};
	const toggle = (): void => {
		if (element.hidden) {
			open();
		} else {
			close();
		}
	};
	const handleButtonClick = (): void => toggle();
	const handleOutsidePointer = (event: PointerEvent): void => {
		const target = event.target;
		if (
			target instanceof Node &&
			!element.contains(target) &&
			!button.contains(target)
		) {
			close();
		}
	};
	const handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape' && !element.hidden) {
			close();
			button.focus();
		}
	};
	const handleViewportChange = (): void => close();
	const handleFullscreenChange = (): void => {
		const portalHost = resolvePortalHost(button);
		if (element.parentNode !== portalHost) {
			portalHost.append(element);
		}
		if (!element.hidden) {
			position();
		}
	};
	button.addEventListener('click', handleButtonClick);
	document.addEventListener('pointerdown', handleOutsidePointer, true);
	document.addEventListener('keydown', handleKeyDown);
	document.addEventListener('fullscreenchange', handleFullscreenChange);
	window.addEventListener('resize', handleViewportChange);
	window.addEventListener('scroll', handleViewportChange, true);
	cleanupCallbacks.push(() => {
		button.removeEventListener('click', handleButtonClick);
		document.removeEventListener('pointerdown', handleOutsidePointer, true);
		document.removeEventListener('keydown', handleKeyDown);
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		window.removeEventListener('resize', handleViewportChange);
		window.removeEventListener('scroll', handleViewportChange, true);
	});
	return {
		element,
		toggle,
		close,
		destroy(): void {
			close();
			element.remove();
		},
	};
}

function createTooltip(cleanupCallbacks: Array<() => void>): {
	readonly bind: (button: HTMLButtonElement, label: string) => void;
	readonly hide: () => void;
	readonly destroy: () => void;
} {
	const tooltip = document.createElement('div');
	tooltip.className = 'baron-chart-workspace-tooltip';
	tooltip.setAttribute('role', 'tooltip');
	tooltip.hidden = true;
	document.body.append(tooltip);
	let activeButton: HTMLButtonElement | null = null;
	const hide = (): void => {
		tooltip.hidden = true;
		activeButton = null;
	};
	const position = (button: HTMLButtonElement): void => {
		const bounds = button.getBoundingClientRect();
		const tooltipBounds = tooltip.getBoundingClientRect();
		const left = Math.min(
			bounds.right + 8,
			window.innerWidth - tooltipBounds.width - 8,
		);
		const top = Math.min(
			Math.max(8, bounds.top + (bounds.height - tooltipBounds.height) / 2),
			window.innerHeight - tooltipBounds.height - 8,
		);
		tooltip.style.left = `${Math.round(left)}px`;
		tooltip.style.top = `${Math.round(top)}px`;
	};
	const bind = (button: HTMLButtonElement, label: string): void => {
		const show = (): void => {
			activeButton = button;
			const portalHost = resolvePortalHost(button);
			if (tooltip.parentNode !== portalHost) {
				portalHost.append(tooltip);
			}
			tooltip.textContent = label;
			tooltip.hidden = false;
			position(button);
		};
		button.addEventListener('mouseenter', show);
		button.addEventListener('mouseleave', hide);
		button.addEventListener('focus', show);
		button.addEventListener('blur', hide);
		cleanupCallbacks.push(() => {
			button.removeEventListener('mouseenter', show);
			button.removeEventListener('mouseleave', hide);
			button.removeEventListener('focus', show);
			button.removeEventListener('blur', hide);
		});
	};
	const handleFullscreenChange = (): void => {
		if (activeButton === null || tooltip.hidden) {
			return;
		}
		const portalHost = resolvePortalHost(activeButton);
		if (tooltip.parentNode !== portalHost) {
			portalHost.append(tooltip);
		}
		position(activeButton);
	};
	document.addEventListener('fullscreenchange', handleFullscreenChange);
	cleanupCallbacks.push(() =>
		document.removeEventListener('fullscreenchange', handleFullscreenChange),
	);
	return { bind, hide, destroy: () => tooltip.remove() };
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

function defaultTimezoneChoices(
	runtime: ChartWorkspaceRuntime,
): readonly WorkspaceToolbarTimezoneChoice[] {
	const chartTimezone = runtime.getDisplayTimezone();
	const localTimezone =
		Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	return [
		{
			value: 'chart',
			label: `图表 · ${chartTimezone}`,
			timezone: chartTimezone,
		},
		{
			value: 'local',
			label: `本机 · ${localTimezone}`,
			timezone: localTimezone,
		},
		{ value: 'utc', label: 'UTC', timezone: 'UTC' },
	];
}

/**
 * 创建 Pro 风格的复合工具栏。Baron 只发出周期/复权宿主意图，
 * 指标、展示时区、价格轴和主序列在浏览器 Runtime 内即时生效。
 */
export function createChartWorkspaceToolbar(
	containers: ChartWorkspaceToolbarContainers,
	runtime: ChartWorkspaceRuntime,
	options: ChartWorkspaceToolbarOptions = {},
): ChartWorkspaceToolbar {
	if (containers.top === containers.left) {
		throw new TypeError('CHART_WORKSPACE_TOOLBAR_CONTAINERS_MUST_DIFFER');
	}
	const descriptor = runtime.getRuntimeCapabilityDescriptor({
		hostActions: [
			...(options.periodActions ?? []),
			...(options.settingsHostActions ?? []),
		],
	});
	const toolbarId = nextWorkspaceToolbarId++;
	const cleanupCallbacks: Array<() => void> = [];
	const dataControls: Array<
		HTMLButtonElement | HTMLInputElement | HTMLSelectElement
	> = [];
	const drawingControls: HTMLButtonElement[] = [];
	const hostActionControls = new Map<string, HostActionControl>();
	const openPopovers: PopoverControl[] = [];
	const style = document.createElement('style');
	style.dataset.baronChartWorkspaceToolbarStyles = '';
	style.textContent = CHART_WORKSPACE_TOOLBAR_STYLES;

	const top = document.createElement('div');
	top.className =
		'baron-chart-workspace-toolbar baron-chart-workspace-toolbar--top';
	top.setAttribute('role', 'toolbar');
	top.setAttribute('aria-label', 'K 线图表工具');
	top.append(style);
	const left = document.createElement('div');
	left.className =
		'baron-chart-workspace-toolbar baron-chart-workspace-toolbar--left';
	left.setAttribute('role', 'toolbar');
	left.setAttribute('aria-label', 'K 线画图工具');
	const tooltip = createTooltip(cleanupCallbacks);

	const hostActions = [
		...(options.periodActions ?? []),
		...(options.settingsHostActions ?? []),
	];
	for (const action of hostActions) {
		if (hostActionControls.has(action.actionId)) {
			throw new TypeError(
				`CHART_WORKSPACE_TOOLBAR_DUPLICATE_HOST_ACTION: ${action.actionId}`,
			);
		}
		const button = createButton({ label: action.label, text: action.label });
		button.dataset.hostAction = action.actionId;
		button.setAttribute('aria-pressed', String(action.pressed ?? false));
		button.setAttribute('aria-busy', String(action.pending ?? false));
		button.disabled = action.disabled ?? false;
		const error = document.createElement('div');
		error.className = 'baron-chart-workspace-toolbar__error';
		error.id = `baron-workspace-host-error-${toolbarId}-${hostActionControls.size}`;
		error.hidden = true;
		error.setAttribute('role', 'alert');
		const control = { button, error };
		hostActionControls.set(action.actionId, control);
		applyHostActionState(control, {
			errorMessage: action.errorMessage ?? null,
		});
		const request = (): void =>
			runtime.requestHostAction(
				action.actionId,
				runtime.getSelectedDrawingId() ?? null,
			);
		button.addEventListener('click', request);
		cleanupCallbacks.push(() => button.removeEventListener('click', request));
	}

	const periodSection = createSection('周期');
	for (const action of options.periodActions ?? []) {
		const control = hostActionControls.get(action.actionId)!;
		control.button.classList.add('baron-chart-workspace-toolbar__period');
		periodSection.append(control.button, control.error);
	}
	top.append(periodSection);

	const primarySection = createSection('图表能力');
	const divider = document.createElement('span');
	divider.className = 'baron-chart-workspace-toolbar__divider';
	divider.setAttribute('aria-hidden', 'true');
	primarySection.append(divider);

	const indicatorButton = createButton({
		label: '主图指标',
		text: '指标',
		icon: 'indicator',
	});
	indicatorButton.dataset.action = 'main-indicators';
	primarySection.append(indicatorButton);
	dataControls.push(indicatorButton);
	const indicatorPopover = createPopover(
		indicatorButton,
		`baron-workspace-indicators-${toolbarId}`,
		cleanupCallbacks,
	);
	openPopovers.push(indicatorPopover);
	const indicatorTitle = document.createElement('div');
	indicatorTitle.className = 'baron-chart-workspace-popover__title';
	indicatorTitle.textContent = '主图指标 · 浏览器实时计算';
	const indicatorGrid = document.createElement('div');
	indicatorGrid.className = 'baron-chart-workspace-popover__grid';
	const indicatorButtons = new Map<string, HTMLButtonElement>();
	const refreshIndicators = (): void => {
		const activeNames = new Set(
			runtime.listMainIndicators().map((indicator) => indicator.name),
		);
		for (const preset of MAIN_PANE_INDICATOR_PRESETS) {
			indicatorButtons
				.get(preset.name)
				?.setAttribute('aria-pressed', String(activeNames.has(preset.name)));
		}
	};
	for (const preset of MAIN_PANE_INDICATOR_PRESETS) {
		const button = createButton({
			label: `${preset.label} 主图指标`,
			text: preset.label,
		});
		button.dataset.indicatorName = preset.name;
		button.setAttribute('aria-pressed', 'false');
		const toggle = (): void => {
			const current = runtime
				.listMainIndicators()
				.filter((indicator) => indicator.name === preset.name);
			if (current.length > 0) {
				for (const indicator of current) {
					runtime.removeMainIndicator(indicator.id);
				}
			} else {
				runtime.addMainIndicator({
					name: preset.name,
					calcParams: preset.calcParams,
				});
			}
			refreshIndicators();
		};
		button.addEventListener('click', toggle);
		cleanupCallbacks.push(() => button.removeEventListener('click', toggle));
		indicatorButtons.set(preset.name, button);
		indicatorGrid.append(button);
	}
	indicatorPopover.element.append(indicatorTitle, indicatorGrid);

	const timezoneChoices =
		options.displayTimezoneChoices ?? defaultTimezoneChoices(runtime);
	const timezoneLabel = document.createElement('label');
	timezoneLabel.className = 'baron-chart-workspace-toolbar__timezone';
	timezoneLabel.append(createToolbarIcon('timezone'));
	const timezoneSelect = document.createElement('select');
	timezoneSelect.className = 'baron-chart-workspace-toolbar__select';
	timezoneSelect.dataset.action = 'display-timezone';
	timezoneSelect.setAttribute('aria-label', '显示时区');
	for (const choice of timezoneChoices) {
		const option = document.createElement('option');
		option.value = choice.value;
		option.textContent = choice.label;
		timezoneSelect.append(option);
	}
	const initialTimezoneValue =
		options.activeDisplayTimezoneValue ??
		timezoneChoices.find(
			(choice) => choice.timezone === runtime.getDisplayTimezone(),
		)?.value;
	if (initialTimezoneValue !== undefined) {
		timezoneSelect.value = initialTimezoneValue;
	}
	let committedTimezoneValue = timezoneSelect.value;
	const changeTimezone = (): void => {
		const choice = timezoneChoices.find(
			(candidate) => candidate.value === timezoneSelect.value,
		);
		if (choice === undefined) {
			return;
		}
		try {
			runtime.setDisplayTimezone(choice.timezone);
			committedTimezoneValue = choice.value;
			options.onDisplayTimezoneChange?.(choice);
		} catch (error) {
			timezoneSelect.value = committedTimezoneValue;
			throw error;
		}
	};
	timezoneSelect.addEventListener('change', changeTimezone);
	cleanupCallbacks.push(() =>
		timezoneSelect.removeEventListener('change', changeTimezone),
	);
	timezoneLabel.append(timezoneSelect);
	primarySection.append(timezoneLabel);
	top.append(primarySection);

	const endSection = createSection('设置与全屏', true);
	const settingsButton = createButton({ label: '图表设置', icon: 'settings' });
	settingsButton.dataset.action = 'settings';
	endSection.append(settingsButton);
	const settingsPopover = createPopover(
		settingsButton,
		`baron-workspace-settings-${toolbarId}`,
		cleanupCallbacks,
	);
	openPopovers.push(settingsPopover);

	const settingsList = document.createElement('div');
	settingsList.className = 'baron-chart-workspace-popover__settings';
	if ((options.settingsHostActions?.length ?? 0) > 0) {
		const { row, control } = createSettingsRow('复权', 'adjustment');
		const segmented = createSegmentedControl('复权', 'host-settings');
		for (const action of options.settingsHostActions ?? []) {
			const hostControl = hostActionControls.get(action.actionId)!;
			hostControl.button.classList.add(
				'baron-chart-workspace-popover__segment',
			);
			segmented.append(hostControl.button);
			control.append(hostControl.error);
		}
		control.prepend(segmented);
		settingsList.append(row);
	}

	if (descriptor.valueAxis.mutable) {
		const { row, control } = createSettingsRow('价格轴', 'price-scale');
		const segmented = createSegmentedControl('价格轴', 'price-scale');
		const scaleButtons = new Map<
			'linear' | 'logarithmic',
			HTMLButtonElement
		>();
		for (const scale of descriptor.valueAxis.supportedScales) {
			const label = scale === 'linear' ? '线性' : '对数';
			const button = createButton({
				label: `${label}价格轴`,
				text: label,
				className: 'baron-chart-workspace-popover__segment',
			});
			button.dataset.priceScale = scale;
			button.setAttribute(
				'aria-pressed',
				String(scale === descriptor.valueAxis.activeScale),
			);
			scaleButtons.set(scale, button);
			segmented.append(button);
		}
		let committedScale = descriptor.valueAxis.activeScale;
		for (const [scale, button] of scaleButtons) {
			const changeScale = async (): Promise<void> => {
				if (scale === committedScale) {
					return;
				}
				try {
					await runtime.setValueAxisScale(scale);
					committedScale = scale;
					selectSegment(scaleButtons, committedScale);
				} catch (error) {
					selectSegment(scaleButtons, committedScale);
					throw error;
				}
			};
			button.addEventListener('click', changeScale);
			cleanupCallbacks.push(() =>
				button.removeEventListener('click', changeScale),
			);
			dataControls.push(button);
		}
		control.append(segmented);
		settingsList.append(row);
	}
	if (descriptor.mainSeriesPresentation !== null) {
		const mainSeries = descriptor.mainSeriesPresentation;
		const { row, control } = createSettingsRow('主序列', 'main-series');
		const select = document.createElement('select');
		select.className = 'baron-chart-workspace-toolbar__select';
		select.dataset.action = 'main-series';
		select.setAttribute('aria-label', '主序列');
		for (const presentation of mainSeries.presentations) {
			const option = document.createElement('option');
			option.value = presentation.type;
			option.textContent = presentationLabel(presentation.type);
			select.append(option);
		}
		select.value = mainSeries.activeType;
		const changeMainSeries = (): void => {
			const presentation = mainSeries.presentations.find(
				(candidate) => candidate.type === select.value,
			);
			if (presentation !== undefined) {
				select.value =
					runtime.setMainSeriesPresentation(presentation).activeType;
			}
		};
		select.addEventListener('change', changeMainSeries);
		cleanupCallbacks.push(() =>
			select.removeEventListener('change', changeMainSeries),
		);
		dataControls.push(select);
		control.append(select);
		settingsList.append(row);
	}
	settingsPopover.element.append(settingsList);

	if (options.fullscreenControl !== 'hidden') {
		const fullscreenTarget =
			options.fullscreenTarget ?? containers.top.parentElement;
		const fullscreenButton = createButton({
			label: '进入全屏',
			icon: 'fullscreen',
		});
		fullscreenButton.dataset.action = 'fullscreen';
		fullscreenButton.disabled =
			fullscreenTarget === null ||
			typeof fullscreenTarget.requestFullscreen !== 'function';
		const refreshFullscreen = (): void => {
			const active =
				fullscreenTarget !== null &&
				document.fullscreenElement === fullscreenTarget;
			fullscreenButton.setAttribute('aria-pressed', String(active));
			fullscreenButton.setAttribute(
				'aria-label',
				active ? '退出全屏' : '进入全屏',
			);
			fullscreenButton.replaceChildren(
				createToolbarIcon(active ? 'fullscreenExit' : 'fullscreen'),
			);
		};
		const toggleFullscreen = async (): Promise<void> => {
			if (document.fullscreenElement !== null) {
				await document.exitFullscreen();
			} else {
				await fullscreenTarget?.requestFullscreen();
			}
		};
		fullscreenButton.addEventListener('click', toggleFullscreen);
		document.addEventListener('fullscreenchange', refreshFullscreen);
		cleanupCallbacks.push(
			() => fullscreenButton.removeEventListener('click', toggleFullscreen),
			() => document.removeEventListener('fullscreenchange', refreshFullscreen),
		);
		endSection.append(fullscreenButton);
	}
	top.append(endSection);

	const drawableTypes = (
		descriptor.drawingTypes.length === 0
			? SUPPORTED_OVERLAYS
			: descriptor.drawingTypes
	) as readonly SupportedOverlayType[];
	const overlayButtons: HTMLButtonElement[] = [];
	for (const group of TOOLBAR_GROUPS) {
		if (group.id === 'edit' || group.id === 'action') {
			continue;
		}
		const section = createSection(group.label);
		for (const overlayType of drawableTypes) {
			const presentation = OVERLAY_TOOL_PRESENTATIONS[overlayType];
			if (presentation.group !== group.id) {
				continue;
			}
			const button = createButton({
				label: presentation.label,
				icon: presentation.icon,
			});
			button.dataset.overlayType = overlayType;
			button.setAttribute('aria-pressed', 'false');
			const startDrawing = (text?: string): void => {
				runtime.startDrawing(
					overlayType,
					text === undefined ? {} : { text },
				);
				for (const candidate of overlayButtons) {
					candidate.setAttribute('aria-pressed', String(candidate === button));
				}
				tooltip.hide();
			};
			if (TEXT_OVERLAY_TYPES.has(overlayType)) {
				const textPopover = createPopover(
					button,
					`baron-workspace-text-${toolbarId}-${overlayType}`,
					cleanupCallbacks,
				);
				openPopovers.push(textPopover);
				const form = document.createElement('form');
				form.className = 'baron-chart-workspace-popover__text-form';
				const input = document.createElement('input');
				input.type = 'text';
				input.placeholder = '输入标注文本';
				input.setAttribute('aria-label', `${presentation.label}文本`);
				const confirm = createButton({
					label: `开始绘制${presentation.label}`,
					text: '开始绘制',
				});
				confirm.type = 'submit';
				const submit = (event: SubmitEvent): void => {
					event.preventDefault();
					startDrawing(input.value);
					textPopover.close();
				};
				form.addEventListener('submit', submit);
				cleanupCallbacks.push(() => form.removeEventListener('submit', submit));
				const focusInput = (): void => {
					requestAnimationFrame(() => {
						if (!textPopover.element.hidden) {
							input.focus();
						}
					});
				};
				button.addEventListener('click', focusInput);
				cleanupCallbacks.push(() =>
					button.removeEventListener('click', focusInput),
				);
				dataControls.push(input, confirm);
				form.append(input, confirm);
				textPopover.element.append(form);
			} else {
				const start = (): void => startDrawing();
				button.addEventListener('click', start);
				cleanupCallbacks.push(() => button.removeEventListener('click', start));
			}
			tooltip.bind(button, presentation.label);
			overlayButtons.push(button);
			drawingControls.push(button);
			dataControls.push(button);
			section.append(button);
		}
		if (section.childElementCount > 0) {
			left.append(section);
		}
	}
	const clearDrawingToolSelection = (): void => {
		for (const button of overlayButtons) {
			button.setAttribute('aria-pressed', 'false');
		}
	};
	const drawingActions = createSection('标注操作');
	const clearButton = createButton({ label: '清空全部标注', icon: 'clearAll' });
	clearButton.dataset.action = 'clear-all';
	const clearDrawings = (): void => {
		runtime.removeDrawings(
			runtime.listDrawings()
				.filter((drawing) => !drawing.locked)
				.map((drawing) => drawing.id),
		);
		runtime.selectDrawing(null);
	};
	clearButton.addEventListener('click', clearDrawings);
	cleanupCallbacks.push(() =>
		clearButton.removeEventListener('click', clearDrawings),
	);
	tooltip.bind(clearButton, '清空全部标注');
	drawingControls.push(clearButton);
	dataControls.push(clearButton);
	drawingActions.append(clearButton);
	left.append(drawingActions);

	containers.top.append(top);
	containers.left.append(left);
	const eventCapability = workspaceEventCapability(runtime);
	if (eventCapability !== undefined) {
		cleanupCallbacks.push(eventCapability.subscribe((event) => {
			if (
				(event.type === 'drawing-candidate' && event.operation === 'create') ||
				event.type === 'drawing-committed' ||
				event.type === 'drawing-rejected' ||
				(event.type === 'selection-changed' && event.id === null) ||
				event.type === 'workspace-error'
			) {
				clearDrawingToolSelection();
			}
		}));
	}
	const stateCapability = runtimeStateCapability(runtime);
	let runtimeReady = stateCapability === undefined;
	let hostDataDisabled = false;
	let hostDrawingDisabled = false;
	const applyDisabledState = (): void => {
		for (const control of dataControls) {
			control.disabled = !runtimeReady || hostDataDisabled;
		}
		if (hostDrawingDisabled) {
			for (const control of drawingControls) {
				control.disabled = true;
			}
		}
	};
	let unsubscribeIndicatorChanges: (() => void) | undefined;
	if (stateCapability !== undefined) {
		const applyRuntimeState = (
			state: ReturnType<RuntimeStateAware['getRuntimeState']>,
		): void => {
			runtimeReady = state === 'ready';
			top.dataset.runtimeState = state;
			left.dataset.runtimeState = state;
			if (runtimeReady) {
				refreshIndicators();
				unsubscribeIndicatorChanges ??=
					runtime.subscribeDrawingChanges(refreshIndicators);
			}
			applyDisabledState();
		};
		applyRuntimeState(stateCapability.getRuntimeState());
		cleanupCallbacks.push(
			stateCapability.subscribeRuntimeState(applyRuntimeState),
		);
	} else {
		refreshIndicators();
		unsubscribeIndicatorChanges =
			runtime.subscribeDrawingChanges(refreshIndicators);
	}
	cleanupCallbacks.push(() => unsubscribeIndicatorChanges?.());

	let destroyed = false;
	let unregisterRuntime = (): void => {};
	const toolbar: ChartWorkspaceToolbar = {
		topElement: top,
		leftElement: left,
		setDataActionsDisabled(disabled): void {
			if (destroyed) {
				throw new Error('CHART_WORKSPACE_TOOLBAR_DESTROYED');
			}
			hostDataDisabled = disabled;
			applyDisabledState();
		},
		setDrawingActionsDisabled(disabled): void {
			if (destroyed) {
				throw new Error('CHART_WORKSPACE_TOOLBAR_DESTROYED');
			}
			hostDrawingDisabled = disabled;
			applyDisabledState();
		},
		setHostActionState(actionId, state): void {
			if (destroyed) {
				throw new Error('CHART_WORKSPACE_TOOLBAR_DESTROYED');
			}
			const control = hostActionControls.get(actionId);
			if (control === undefined) {
				throw new TypeError(
					`CHART_WORKSPACE_TOOLBAR_UNKNOWN_HOST_ACTION: ${actionId}`,
				);
			}
			applyHostActionState(control, state);
		},
		setDisplayTimezoneChoice(value): void {
			if (destroyed) {
				throw new Error('CHART_WORKSPACE_TOOLBAR_DESTROYED');
			}
			const choice = timezoneChoices.find((candidate) => candidate.value === value);
			if (choice === undefined) {
				throw new TypeError(
					`CHART_WORKSPACE_TOOLBAR_UNKNOWN_TIMEZONE: ${value}`,
				);
			}
			runtime.setDisplayTimezone(choice.timezone);
			timezoneSelect.value = value;
			committedTimezoneValue = value;
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
			for (const popover of openPopovers) {
				popover.destroy();
			}
			tooltip.destroy();
			top.remove();
			left.remove();
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
