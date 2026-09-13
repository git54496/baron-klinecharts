import type { SceneIndicator } from '@baron1996/kline-scene-schema';

export interface IndicatorSettingsRuntime {
	listConfigurableIndicators(): readonly SceneIndicator[];
	updateIndicatorParams(id: string, calcParams: readonly number[], styles?: SceneIndicator['styles']): SceneIndicator;
}

export interface IndicatorSettingsDialog {
	open(id: string, trigger?: HTMLElement): void;
	destroy(): void;
}

let nextIndicatorSettingsDialogId = 1;

interface LineDraft { period: string; color: string; size: string; style: 'solid' | 'dashed' | 'dotted'; visible: boolean }
const lineColors = ['#2962ff', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#0891b2', '#db2777', '#65a30d'];
const eyeOpen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeClosed = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A11.5 11.5 0 0 1 12 6c6.4 0 10 6 10 6a15 15 0 0 1-3.1 3.5M6.4 6.8C3.6 8.5 2 12 2 12s3.6 6 10 6c1.7 0 3.2-.4 4.4-1"/></svg>';
const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3m4 0-1 13H7L6 7m4 4v6m4-6v6"/></svg>';

function toHex(color: string, fallback: string): string {
	const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/.exec(color);
	return match === null ? fallback : `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

function toRgba(hex: string): string {
	return `rgba(${Number.parseInt(hex.slice(1, 3), 16)}, ${Number.parseInt(hex.slice(3, 5), 16)}, ${Number.parseInt(hex.slice(5, 7), 16)}, 1)`;
}

function labelsFor(indicator: SceneIndicator): string[] {
	if (indicator.name === 'BOLL') return ['计算周期', '标准差倍数'];
	if (indicator.name === 'SMA') return ['计算周期', '平滑权重'];
	if (indicator.name === 'SAR') return ['初始加速因子', '递增步长', '加速因子上限'];
	return indicator.calcParams.map((_, index) => `周期 ${index + 1}`);
}

function allowsFraction(indicator: SceneIndicator, index: number): boolean {
	return indicator.name === 'SAR' || (indicator.name === 'BOLL' && index === 1);
}

export function createIndicatorSettingsDialog(
	runtime: IndicatorSettingsRuntime,
	onApplied?: (indicator: SceneIndicator) => void,
): IndicatorSettingsDialog {
	const dialog = document.createElement('dialog');
	dialog.className = 'baron-indicator-settings';
	const titleId = `baron-indicator-settings-title-${nextIndicatorSettingsDialogId++}`;
	dialog.setAttribute('aria-labelledby', titleId);
	const form = document.createElement('form');
	form.noValidate = true;
	const heading = document.createElement('h2');
	heading.id = titleId;
	const hint = document.createElement('p');
	hint.textContent = '保存后立即更新图表中的指标计算。';
	const fields = document.createElement('div');
	fields.className = 'baron-indicator-settings__fields';
	const add = document.createElement('button');
	add.type = 'button';
	add.className = 'baron-indicator-settings__add';
	add.textContent = '＋ 添加周期';
	const error = document.createElement('p');
	error.className = 'baron-indicator-settings__error';
	error.setAttribute('role', 'alert');
	const actions = document.createElement('div');
	actions.className = 'baron-indicator-settings__actions';
	const cancel = document.createElement('button');
	cancel.type = 'button';
	cancel.textContent = '取消';
	const save = document.createElement('button');
	save.type = 'submit';
	save.textContent = '应用设置';
	actions.append(cancel, save);
	form.append(heading, hint, fields, add, error, actions);
	dialog.append(form);
	let activeId: string | null = null;
	let returnFocus: HTMLElement | null = null;
	let returnFocusIndicatorId: string | null = null;
	let drafts: LineDraft[] = [];
	const renderLines = (): void => {
		fields.replaceChildren();
		drafts.forEach((draft, index) => {
			const row = document.createElement('div');
			row.className = 'baron-indicator-settings__line';
			row.classList.toggle('is-hidden', !draft.visible);
			const header = document.createElement('div');
			header.className = 'baron-indicator-settings__line-header';
			const title = document.createElement('strong');
			title.textContent = `周期 ${index + 1}`;
			const controls = document.createElement('div');
			controls.className = 'baron-indicator-settings__line-controls';
			const eye = document.createElement('button');
			eye.type = 'button';
			eye.className = 'baron-indicator-settings__icon';
			const updateEye = (): void => {
				eye.innerHTML = draft.visible ? eyeOpen : eyeClosed;
				eye.setAttribute('aria-label', `${draft.visible ? '隐藏' : '显示'}周期 ${index + 1}`);
				eye.setAttribute('aria-pressed', String(draft.visible));
				row.classList.toggle('is-hidden', !draft.visible);
			};
			updateEye();
			eye.addEventListener('click', () => { draft.visible = !draft.visible; updateEye(); });
			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'baron-indicator-settings__icon';
			remove.innerHTML = trash;
			remove.setAttribute('aria-label', `删除周期 ${index + 1}`);
			remove.disabled = drafts.length === 1;
			remove.addEventListener('click', () => {
				drafts.splice(index, 1);
				renderLines();
				(fields.querySelector<HTMLInputElement>('input[type=number]') ?? add).focus();
			});
			controls.append(eye, remove);
			header.append(title, controls);
			const values = document.createElement('div');
			values.className = 'baron-indicator-settings__line-values';
			const periodLabel = document.createElement('label');
			periodLabel.textContent = '周期';
			const period = document.createElement('input');
			period.type = 'number'; period.min = '1'; period.max = '100000'; period.step = '1'; period.required = true;
			period.value = draft.period;
			period.addEventListener('input', () => { draft.period = period.value; });
			periodLabel.append(period);
			const colorLabel = document.createElement('label');
			colorLabel.textContent = '颜色';
			const color = document.createElement('input');
			color.type = 'color'; color.value = draft.color;
			color.addEventListener('input', () => { draft.color = color.value; });
			colorLabel.append(color);
			const sizeLabel = document.createElement('label');
			sizeLabel.textContent = '线宽';
			const size = document.createElement('select');
			for (const width of [1, 1.5, 2, 2.5, 3, 4]) size.append(new Option(`${width} px`, String(width)));
			if (!Array.from(size.options).some((option) => option.value === draft.size)) {
				size.append(new Option(`${draft.size} px`, draft.size));
			}
			size.value = draft.size;
			size.addEventListener('change', () => { draft.size = size.value; });
			sizeLabel.append(size);
			values.append(periodLabel, colorLabel, sizeLabel);
			row.append(header, values);
			fields.append(row);
		});
		add.disabled = drafts.length >= 8;
		add.title = add.disabled ? '最多添加 8 条周期线' : '';
	};
	const onAdd = (): void => {
		if (drafts.length >= 8) return;
		const previous = Number(drafts.at(-1)?.period ?? 0);
		drafts.push({ period: String(Number.isInteger(previous) && previous > 0 ? previous + 5 : 5),
			color: lineColors[drafts.length % lineColors.length]!, size: '1', style: 'solid', visible: true });
		renderLines();
		fields.querySelectorAll<HTMLInputElement>('input[type=number]').item(drafts.length - 1)?.focus();
	};
	const close = (): void => { if (dialog.open) dialog.close(); };
	const onClose = (): void => {
		activeId = null;
		const replacement = returnFocusIndicatorId === null ? null :
			Array.from(document.querySelectorAll<HTMLElement>('[data-indicator-settings-id]'))
				.find((button) => button.dataset.indicatorSettingsId === returnFocusIndicatorId);
		if (returnFocus?.isConnected) returnFocus.focus();
		else replacement?.focus();
		returnFocus = null;
		returnFocusIndicatorId = null;
	};
	const onSubmit = (event: SubmitEvent): void => {
		event.preventDefault();
		const indicator = runtime.listConfigurableIndicators().find((item) => item.id === activeId);
		if (indicator === undefined) {
			error.textContent = '指标已移除，请重新打开设置。';
			return;
		}
		const multiLine = indicator.name === 'MA' || indicator.name === 'EMA';
		const inputs = Array.from(fields.querySelectorAll<HTMLInputElement>('input[type=number]'));
		const values = inputs.map((input) => Number(input.value));
		const invalidIndex = inputs.findIndex((input, index) =>
			input.value.trim() === '' || !Number.isFinite(values[index]) || values[index]! <= 0 ||
			values[index]! > 100000 || (!allowsFraction(indicator, index) && !Number.isInteger(values[index])),
		);
		if (invalidIndex >= 0) {
			error.textContent = '请输入有效的正数；周期必须为整数。';
			inputs[invalidIndex]?.focus();
			return;
		}
		if (indicator.name === 'SMA' && values[1]! > values[0]!) {
			error.textContent = '平滑权重不能大于计算周期。';
			inputs[1]?.focus();
			return;
		}
		error.textContent = '';
		try {
			const styles = multiLine ? {
				...indicator.styles,
				lines: drafts.map((draft) => ({
					color: toRgba(draft.color), size: Number(draft.size), style: draft.style, visible: draft.visible,
				})),
			} : undefined;
			const updated = runtime.updateIndicatorParams(indicator.id, values, styles);
			onApplied?.(updated);
			close();
		} catch (cause) {
			error.textContent = cause instanceof Error ? cause.message : '参数更新失败。';
		}
	};
	cancel.addEventListener('click', close);
	add.addEventListener('click', onAdd);
	dialog.addEventListener('close', onClose);
	form.addEventListener('submit', onSubmit);
	return {
		open(id, trigger) {
			const indicator = runtime.listConfigurableIndicators().find((item) => item.id === id);
			if (indicator === undefined || !indicator.visible) return;
			if (dialog.open) return;
			activeId = id;
			returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
			returnFocusIndicatorId = trigger?.dataset.indicatorSettingsId ?? null;
			heading.textContent = `${indicator.name} 参数`;
			error.textContent = '';
			fields.replaceChildren();
			const multiLine = indicator.name === 'MA' || indicator.name === 'EMA';
			add.hidden = !multiLine;
			dialog.classList.toggle('baron-indicator-settings--lines', multiLine);
			if (multiLine) {
				drafts = indicator.calcParams.map((period, index) => ({
					period: String(period),
					color: toHex(indicator.styles.lines[index]?.color ?? '', lineColors[index % lineColors.length]!),
					size: String(indicator.styles.lines[index]?.size ?? 1),
					style: indicator.styles.lines[index]?.style ?? 'solid',
					visible: indicator.styles.lines[index]?.visible !== false,
				}));
				renderLines();
			} else {
			const labels = labelsFor(indicator);
			indicator.calcParams.forEach((value, index) => {
				const label = document.createElement('label');
				label.textContent = labels[index] ?? `参数 ${index + 1}`;
				const input = document.createElement('input');
				input.type = 'number';
				input.min = '0.000001';
				input.max = '100000';
				input.step = allowsFraction(indicator, index) ? 'any' : '1';
				input.required = true;
				input.value = String(value);
				label.append(input);
				fields.append(label);
			});
			}
			(document.fullscreenElement ?? document.body).append(dialog);
			dialog.showModal();
			fields.querySelector<HTMLInputElement>('input[type=number]')?.focus();
		},
		destroy() {
			close();
			cancel.removeEventListener('click', close);
			add.removeEventListener('click', onAdd);
			dialog.removeEventListener('close', onClose);
			form.removeEventListener('submit', onSubmit);
			dialog.remove();
		},
	};
}
