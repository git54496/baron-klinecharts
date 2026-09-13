import type { SceneIndicator } from '@baron1996/kline-scene-schema';

export interface IndicatorSettingsRuntime {
	listConfigurableIndicators(): readonly SceneIndicator[];
	updateIndicatorParams(id: string, calcParams: readonly number[]): SceneIndicator;
}

export interface IndicatorSettingsDialog {
	open(id: string, trigger?: HTMLElement): void;
	destroy(): void;
}

let nextIndicatorSettingsDialogId = 1;

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
	form.append(heading, hint, fields, error, actions);
	dialog.append(form);
	let activeId: string | null = null;
	let returnFocus: HTMLElement | null = null;
	let returnFocusIndicatorId: string | null = null;
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
		const inputs = Array.from(fields.querySelectorAll<HTMLInputElement>('input'));
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
			const updated = runtime.updateIndicatorParams(indicator.id, values);
			onApplied?.(updated);
			close();
		} catch (cause) {
			error.textContent = cause instanceof Error ? cause.message : '参数更新失败。';
		}
	};
	cancel.addEventListener('click', close);
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
			(document.fullscreenElement ?? document.body).append(dialog);
			dialog.showModal();
			fields.querySelector('input')?.focus();
		},
		destroy() {
			close();
			cancel.removeEventListener('click', close);
			dialog.removeEventListener('close', onClose);
			form.removeEventListener('submit', onSubmit);
			dialog.remove();
		},
	};
}
