import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const chartWorkspaceFixture = JSON.parse(
	await readFile(new URL('../../../tests/fixtures/workspaces/chart-minimal.json', import.meta.url)),
);
const timeSeriesWorkspaceFixture = JSON.parse(
	await readFile(new URL('../../../tests/fixtures/workspaces/time-series-minimal.json', import.meta.url)),
);
const minimalScene = loadScene('minimal-valid.json');
const m1Scene = loadScene('m1-candle-horizontal-line.json');
const m2Scene = loadScene('m2-measurement-linear.json');

test('@browser toolbar uses registered tools and DOM APIs with explicit teardown', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
			SUPPORTED_OVERLAYS,
		} = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const calls: Array<{ type: string; text: string | undefined }> = [];
		const originalStart = runtime.startOverlayDrawing.bind(runtime);
		runtime.startOverlayDrawing = ((type: string, options?: { text?: string }) => {
			calls.push({ type, text: options?.text });
			return `test-${type}`;
		}) as typeof runtime.startOverlayDrawing;
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
		);
		const buttons = [...toolbar.element.querySelectorAll<HTMLButtonElement>('[data-overlay-type]')];
		buttons[0]!.click();
		const textInput = toolbar.element.querySelector<HTMLInputElement>('[data-action="overlay-text"]')!;
		textInput.value = '压力位';
		toolbar.element.querySelector<HTMLButtonElement>('[data-overlay-type="simpleAnnotation"]')!.click();
		const types = buttons.map((button) => button.dataset.overlayType);
		void originalStart;
		runtime.destroy();
		return {
			expected: [...SUPPORTED_OVERLAYS],
			types,
			calls,
			remaining: document.querySelector('#toolbar')!.childElementCount,
		};
	}, minimalScene);

	expect(new Set(result.types)).toEqual(new Set(result.expected));
	expect(result.calls).toEqual([
		{ type: result.expected[0], text: undefined },
		{ type: 'simpleAnnotation', text: '压力位' },
	]);
	expect(result.remaining).toBe(0);
});

test('@browser toolbar renders the approved icon groups in normal flow', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const chartRoot = document.querySelector<HTMLElement>('#chart')!;
		const runtime = await createKLineSceneRuntime(chartRoot, scene);
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
		);
		const overlayButtons = [
			...toolbar.element.querySelectorAll<HTMLButtonElement>('[data-overlay-type]'),
		];
		const actionButtons = [
			...toolbar.element.querySelectorAll<HTMLButtonElement>('[data-action="clear-all"], [data-action="export"]'),
		];
		overlayButtons[7]!.click();
		const toolbarRect = toolbar.element.getBoundingClientRect();
		const chartRect = chartRoot.getBoundingClientRect();
		const firstIcon = overlayButtons[0]!.querySelector('svg');
		const measurementIcon = toolbar.element.querySelector<SVGElement>(
			'[data-overlay-type="priceMeasurement"] svg',
		);
		const viewport = toolbar.element.querySelector<HTMLElement>('.baron-kline-toolbar__viewport');
		const data = {
			labels: overlayButtons.map((button) => button.getAttribute('aria-label')),
			actions: actionButtons.map((button) => button.getAttribute('aria-label')),
			groups: [
				...toolbar.element.querySelectorAll<HTMLElement>('[data-toolbar-group]'),
			].map((group) => group.getAttribute('aria-label')),
			buttonText: [...overlayButtons, ...actionButtons].map((button) => button.textContent),
			viewBox: firstIcon?.getAttribute('viewBox'),
			strokeWidth: firstIcon?.getAttribute('stroke-width'),
			buttonSize: {
				width: getComputedStyle(overlayButtons[0]!).width,
				height: getComputedStyle(overlayButtons[0]!).height,
			},
			iconSize: firstIcon === null
				? undefined
				: {
						width: getComputedStyle(firstIcon).width,
						height: getComputedStyle(firstIcon).height,
					},
			measurementIcon: measurementIcon === null
				? undefined
				: {
						nodes: [...measurementIcon.children].map((node) => node.nodeName.toLowerCase()),
						bounds: measurementIcon.querySelector('rect')?.getAttributeNames()
							.reduce<Record<string, string | null>>((attributes, name) => {
								attributes[name] = measurementIcon.querySelector('rect')?.getAttribute(name) ?? null;
								return attributes;
							}, {}),
					},
			pressed: overlayButtons.map((button) => button.getAttribute('aria-pressed')),
			hasTextInput: toolbar.element.querySelector('[data-action="overlay-text"]') !== null,
			chartGap: Math.round(chartRect.top - toolbarRect.bottom),
			hasViewport: viewport !== null,
		};
		toolbar.destroy();
		runtime.destroy();
		return data;
	}, minimalScene);

	expect(result.labels).toEqual([
		'水平射线',
		'水平线段',
		'水平直线',
		'垂直射线',
		'垂直线段',
		'垂直直线',
		'射线',
		'线段',
		'直线',
		'价格线',
		'价格通道',
		'平行直线',
		'斐波那契线',
		'价格量度',
		'画笔',
		'简易标注',
		'简易标签',
		'矩形',
		'箭头',
		'十字线',
		'注释框',
		'文本',
	]);
	expect(result.actions).toEqual(['清空全部标注', '导出场景']);
	expect(result.groups).toEqual([
		'水平线',
		'垂直线',
		'趋势线',
		'价格与分析',
		'标注',
		'形状与文本',
		'坐标与样式',
		'操作',
	]);
	expect(result.buttonText).toEqual(Array.from({ length: 24 }, () => ''));
	expect(result.viewBox).toBe('0 0 24 24');
	expect(result.strokeWidth).toBe('2');
	expect(result.buttonSize).toEqual({ width: '34px', height: '34px' });
	expect(result.iconSize).toEqual({ width: '19px', height: '19px' });
	expect(result.measurementIcon).toEqual({
		nodes: ['rect', 'path', 'path', 'path'],
		bounds: {
			x: '4',
			y: '5',
			width: '16',
			height: '14',
			rx: '1.5',
			'stroke-dasharray': '2 2',
		},
	});
	expect(result.pressed[7]).toBe('true');
	expect(result.pressed.filter((value) => value === 'true')).toHaveLength(1);
	expect(result.hasTextInput).toBe(true);
	expect(result.chartGap).toBe(0);
	expect(result.hasViewport).toBe(true);
});

test('@browser M2 standard and Drawing toolbars expose their separate capabilities', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			createDrawingFloatingToolbar,
			createKLineSceneRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const events: Array<Record<string, unknown>> = [];
		const chart = document.querySelector<HTMLElement>('#chart')!;
		const runtime = await createKLineSceneRuntime(
			chart,
			scene,
			{ onEvent: (event) => events.push(event) },
		);
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
			{
				hostActions: [{ actionId: 'host.review', label: '交给宿主' }],
			},
		);
		const drawingToolbar = createDrawingFloatingToolbar(chart, runtime, {
			deleteBehavior: 'request',
		});
		const measurementButton = toolbar.element.querySelector<HTMLButtonElement>(
			'[data-overlay-type="priceMeasurement"]',
		)!;
		let startedType = '';
		runtime.startOverlayDrawing = ((type: string) => {
			startedType = type;
			return 'measurement-test';
		}) as typeof runtime.startOverlayDrawing;
		measurementButton.click();
		const scale = toolbar.element.querySelector<HTMLSelectElement>('[data-action="price-scale"]')!;
		scale.value = 'logarithmic';
		scale.dispatchEvent(new Event('change'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		const selectedId = 'm2-aapl-measurement-300-330';
		runtime.selectDrawing(selectedId);
		const color = drawingToolbar.element.querySelector<HTMLInputElement>('[data-action="line-color"]')!;
		color.value = '#ff0000';
		color.dispatchEvent(new Event('change'));
		const selectedAfterStyleChange = runtime.getSelectedOverlayId();
		drawingToolbar.element.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
		toolbar.element.querySelector<HTMLButtonElement>('[data-host-action="host.review"]')!.click();
		const exported = runtime.exportScene();
		const overlay = runtime.getOverlay(selectedId)!;
		runtime.destroy();
		return {
			startedType,
			runtimeVersion: exported.runtime.runtimeVersion,
			scale: exported.panes[0]!.yAxes[0]!.scale,
			lineColor: overlay.styles.line.color,
			selectedAfterStyleChange,
			events,
		};
	}, m2Scene);

	expect(result.startedType).toBe('priceMeasurement');
	expect(result.runtimeVersion).toBe('0.2.0');
	expect(result.scale).toBe('logarithmic');
	expect(result.selectedAfterStyleChange).toBe('m2-aapl-measurement-300-330');
	expect(result.events.filter((event) => event.type === 'overlay-style-changed')).toHaveLength(1);
	expect(result.lineColor).toBe('rgba(255, 0, 0, 1)');
	expect(result.events).toEqual(expect.arrayContaining([
		expect.objectContaining({
			type: 'overlay-style-changed',
			sceneVersion: 1,
			runtimeVersion: '0.2.0',
		}),
		expect.objectContaining({
			type: 'overlay-delete-requested',
			overlayId: 'm2-aapl-measurement-300-330',
		}),
		expect.objectContaining({
			type: 'host-action-requested',
			actionId: 'host.review',
			overlayId: 'm2-aapl-measurement-300-330',
		}),
	]));
});

test('@browser host actions are controlled and expose pending failure rollback', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime, createStandardToolbar } = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
			{
				hostActions: [
					{ actionId: 'price-adjustment.none', label: '不复权', pressed: true },
					{ actionId: 'price-adjustment.forward', label: '前复权' },
				],
			},
		);
		const none = toolbar.element.querySelector<HTMLButtonElement>(
			'[data-host-action="price-adjustment.none"]',
		)!;
		const forward = toolbar.element.querySelector<HTMLButtonElement>(
			'[data-host-action="price-adjustment.forward"]',
		)!;
		const initial = {
			nonePressed: none.getAttribute('aria-pressed'),
			forwardPressed: forward.getAttribute('aria-pressed'),
		};

		toolbar.setHostActionState('price-adjustment.none', { disabled: true });
		toolbar.setHostActionState('price-adjustment.forward', {
			disabled: true,
			pending: true,
			errorMessage: null,
		});
		const pending = {
			nonePressed: none.getAttribute('aria-pressed'),
			forwardPressed: forward.getAttribute('aria-pressed'),
			forwardBusy: forward.getAttribute('aria-busy'),
			noneDisabled: none.disabled,
			forwardDisabled: forward.disabled,
		};

		toolbar.setHostActionState('price-adjustment.none', {
			pressed: true,
			disabled: false,
		});
		toolbar.setHostActionState('price-adjustment.forward', {
			pressed: false,
			disabled: false,
			pending: false,
			errorMessage: '前复权数据加载失败，已恢复不复权',
		});
		const errorId = forward.getAttribute('aria-errormessage');
		const error = errorId === null
			? null
			: toolbar.element.querySelector<HTMLElement>(`#${errorId}`);
		const failed = {
			nonePressed: none.getAttribute('aria-pressed'),
			forwardPressed: forward.getAttribute('aria-pressed'),
			forwardBusy: forward.getAttribute('aria-busy'),
			noneDisabled: none.disabled,
			forwardDisabled: forward.disabled,
			errorText: error?.textContent ?? null,
			errorRole: error?.getAttribute('role') ?? null,
			errorLive: error?.getAttribute('aria-live') ?? null,
			errorHidden: error?.hidden ?? null,
		};

		toolbar.setHostActionState('price-adjustment.forward', {
			errorMessage: null,
		});
		const cleared = {
			errorReference: forward.getAttribute('aria-errormessage'),
			errorHidden: error?.hidden ?? null,
		};
		runtime.destroy();
		return { initial, pending, failed, cleared };
	}, m2Scene);

	expect(result.initial).toEqual({
		nonePressed: 'true',
		forwardPressed: 'false',
	});
	expect(result.pending).toEqual({
		nonePressed: 'true',
		forwardPressed: 'false',
		forwardBusy: 'true',
		noneDisabled: true,
		forwardDisabled: true,
	});
	expect(result.failed).toEqual({
		nonePressed: 'true',
		forwardPressed: 'false',
		forwardBusy: 'false',
		noneDisabled: false,
		forwardDisabled: false,
		errorText: '前复权数据加载失败，已恢复不复权',
		errorRole: 'alert',
		errorLive: 'assertive',
		errorHidden: false,
	});
	expect(result.cleared).toEqual({
		errorReference: null,
		errorHidden: true,
	});
});

test('@browser toolbar Tooltip supports hover, focus, viewport clamping, and narrow scrolling', async ({ page }) => {
	await page.setViewportSize({ width: 420, height: 760 });
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const chartRoot = document.querySelector<HTMLElement>('#chart')!;
		const toolbarRoot = document.querySelector<HTMLElement>('#toolbar')!;
		chartRoot.style.width = '360px';
		toolbarRoot.style.width = '360px';
		const runtime = await createKLineSceneRuntime(chartRoot, scene);
		createStandardToolbar(toolbarRoot, runtime);
	}, minimalScene);

	const horizontalRay = page.locator('[data-overlay-type="horizontalRayLine"]');
	await horizontalRay.hover();
	const tooltip = page.locator('.baron-kline-toolbar-tooltip');
	await expect(tooltip).toBeVisible();
	await expect(tooltip.locator('strong')).toHaveText('水平射线');
	await expect(tooltip.locator('code')).toHaveText('horizontalRayLine');

	const hoverGeometry = await page.evaluate(() => {
		const tip = document.querySelector<HTMLElement>('.baron-kline-toolbar-tooltip')!.getBoundingClientRect();
		const viewport = document.querySelector<HTMLElement>('.baron-kline-toolbar__viewport')!.getBoundingClientRect();
		return {
			leftInside: tip.left >= viewport.left,
			rightInside: tip.right <= viewport.right,
			pageWidth: document.documentElement.scrollWidth,
			clientWidth: document.documentElement.clientWidth,
			toolbarScrollWidth: document.querySelector<HTMLElement>('.baron-kline-toolbar__viewport')!.scrollWidth,
			toolbarClientWidth: document.querySelector<HTMLElement>('.baron-kline-toolbar__viewport')!.clientWidth,
		};
	});
	expect(hoverGeometry.leftInside).toBe(true);
	expect(hoverGeometry.rightInside).toBe(true);
	expect(hoverGeometry.pageWidth).toBe(hoverGeometry.clientWidth);
	expect(hoverGeometry.toolbarScrollWidth).toBeGreaterThan(hoverGeometry.toolbarClientWidth);

	const viewport = page.locator('.baron-kline-toolbar__viewport');
	const scrollBehavior = await viewport.evaluate((element) => ({
		maxWidth: getComputedStyle(element).maxWidth,
		overflowX: getComputedStyle(element).overflowX,
		overscrollBehaviorX: getComputedStyle(element).overscrollBehaviorX,
		touchAction: getComputedStyle(element).touchAction,
	}));
	expect(scrollBehavior).toEqual({
		maxWidth: '100%',
		overflowX: 'auto',
		overscrollBehaviorX: 'contain',
		touchAction: 'pan-x',
	});
	await viewport.hover();
	await page.mouse.wheel(0, 180);
	await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

	await page.locator('[data-overlay-type="verticalSegment"]').focus();
	await expect(tooltip.locator('strong')).toHaveText('垂直线段');
	await expect(tooltip.locator('code')).toHaveText('verticalSegment');
});

test('@browser standard toolbar owns export and has no selected-Drawing delete action', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const urls: string[] = [];
		URL.createObjectURL = () => {
			urls.push('created');
			return 'blob:test';
		};
		URL.revokeObjectURL = () => {
			urls.push('revoked');
		};
		HTMLAnchorElement.prototype.click = () => {
			urls.push('clicked');
		};
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
		);
		const hasDelete = toolbar.element.querySelector('[data-action="delete"]') !== null;
		toolbar.element.querySelector<HTMLButtonElement>('[data-action="export"]')!.click();
		runtime.destroy();
		return { hasDelete, urls };
	}, minimalScene);

	expect(result.hasDelete).toBe(false);
	expect(result.urls).toEqual(['created', 'clicked', 'revoked']);
});

test('@browser toolbar shows main series control by default and hides it explicitly', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime, createStandardToolbar } = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
		);
		const shownByDefault = toolbar.element.querySelector('[data-action="main-series"]') !== null;
		const hiddenToolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
			{ mainSeriesPresentationControl: 'hidden' },
		);
		const control = toolbar.element.querySelector<HTMLSelectElement>(
			'[data-action="main-series"]',
		);
		const options = control === null
			? []
			: [...control.options].map((option) => option.value);
		const hiddenExplicitly = hiddenToolbar.element.querySelector('[data-action="main-series"]') === null;
		runtime.destroy();
		return { shownByDefault, hiddenExplicitly, options };
	}, minimalScene);
	expect(result.shownByDefault).toBe(true);
	expect(result.hiddenExplicitly).toBe(true);
	expect(result.options).toEqual([
		'candle_solid',
		'candle_stroke',
		'candle_up_stroke',
		'candle_down_stroke',
		'ohlc',
		'area',
	]);
});

test('@browser Legacy toolbar switches candle→area→candle when enabled', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const { createKLineSceneRuntime, createStandardToolbar } = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
			{ mainSeriesPresentationControl: 'enabled' },
		);
		const control = toolbar.element.querySelector<HTMLSelectElement>(
			'[data-action="main-series"]',
		)!;
		control.value = 'area';
		control.dispatchEvent(new Event('change'));
		const afterArea = runtime.exportScene().chart.candle.type;
		control.value = 'candle_solid';
		control.dispatchEvent(new Event('change'));
		const afterCandle = runtime.exportScene().chart.candle.type;
		runtime.destroy();
		return { afterArea, afterCandle };
	}, minimalScene);
	expect(result.afterArea).toBe('area');
	expect(result.afterCandle).toBe('candle_solid');
});

test('@browser chart Workspace toolbar has 22 tools and working main series control', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (workspace) => {
		const {
			createDrawableWorkspaceRuntime,
			createStandardToolbar,
			SUPPORTED_OVERLAYS,
		} = await import('/src/index.ts');
		const runtime = await createDrawableWorkspaceRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			workspace,
			{ commitMode: 'immediate' },
		);
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
			{ mainSeriesPresentationControl: 'enabled' },
		);
		const buttons = [
			...toolbar.element.querySelectorAll<HTMLButtonElement>('[data-overlay-type]'),
		];
		const control = toolbar.element.querySelector<HTMLSelectElement>(
			'[data-action="main-series"]',
		)!;
		control.value = 'area';
		control.dispatchEvent(new Event('change'));
		const exported = runtime.exportWorkspace();
		const candleType = (exported.scene as { document: { chart: { candle: { type: string } } } })
			.document.chart.candle.type;
		runtime.destroy();
		return { buttons: buttons.length, expected: SUPPORTED_OVERLAYS.length, candleType };
	}, chartWorkspaceFixture);
	expect(result.buttons).toBe(22);
	expect(result.buttons).toBe(result.expected);
	expect(result.candleType).toBe('area');
});

test('@browser composite chart toolbar separates market, settings, and Drawing controls', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (workspace) => {
		const {
			createChartWorkspaceToolbar,
			createDrawableWorkspaceRuntime,
			SUPPORTED_OVERLAYS,
		} = await import('/src/index.ts');
		const events: Array<Record<string, unknown>> = [];
		const runtime = await createDrawableWorkspaceRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			workspace,
			{ commitMode: 'immediate', onEvent: (event) => events.push(event) },
		);
		const leftContainer = document.createElement('div');
		leftContainer.style.height = '600px';
		document.body.append(leftContainer);
		const toolbar = createChartWorkspaceToolbar(
			{
				top: document.querySelector<HTMLElement>('#toolbar')!,
				left: leftContainer,
			},
			runtime,
			{
				periodActions: [
					{ actionId: 'period.1h', label: '1小时', pressed: true },
					{ actionId: 'period.1d', label: '日' },
				],
				settingsHostActions: [
					{ actionId: 'adjustment.qfq', label: '前复权', pressed: true },
				],
				displayTimezoneChoices: [
					{ value: 'instrument', label: '标的时区', timezone: workspace.scene.document.chart.timezone },
					{ value: 'utc', label: 'UTC', timezone: 'UTC' },
				],
				activeDisplayTimezoneValue: 'instrument',
				fullscreenControl: 'hidden',
			},
		);

		const periodButton = toolbar.topElement.querySelector<HTMLButtonElement>(
			'[data-host-action="period.1d"]',
		)!;
		periodButton.click();
		toolbar.topElement.querySelector<HTMLButtonElement>('[data-action="main-indicators"]')!.click();
		const indicatorPopover = document.querySelector<HTMLElement>('[id^="baron-workspace-indicators-"]')!;
		const maButton = indicatorPopover.querySelector<HTMLButtonElement>('[data-indicator-name="MA"]')!;
		for (const button of indicatorPopover.querySelectorAll<HTMLButtonElement>('[data-indicator-name]')) {
			button.click();
		}
		const timezone = toolbar.topElement.querySelector<HTMLSelectElement>('[data-action="display-timezone"]')!;
		timezone.value = 'utc';
		timezone.dispatchEvent(new Event('change'));
		const annotationButton = toolbar.leftElement.querySelector<HTMLButtonElement>(
			'[data-overlay-type="simpleAnnotation"]',
		)!;
		annotationButton.click();
		const textPopover = document.querySelector<HTMLElement>(
			'[id^="baron-workspace-text-"][id$="simpleAnnotation"]',
		)!;
		textPopover.querySelector<HTMLInputElement>('input')!.value = '压力位';
		textPopover.querySelector<HTMLFormElement>('form')!.requestSubmit();
		toolbar.topElement.querySelector<HTMLButtonElement>('[data-action="settings"]')!.click();
		const settingsPopover = document.querySelector<HTMLElement>('[id^="baron-workspace-settings-"]')!;
		const exported = runtime.exportWorkspace();
		const scene = exported.scene.document as typeof workspace.scene.document;
		const snapshot = {
			periods: toolbar.topElement.querySelectorAll('[data-host-action^="period."]').length,
			drawingTools: toolbar.leftElement.querySelectorAll('[data-overlay-type]').length,
			expectedDrawingTools: SUPPORTED_OVERLAYS.length,
			mainIndicators: scene.panes[0].indicators.map((indicator: { name: string }) => indicator.name),
			maPressed: maButton.getAttribute('aria-pressed'),
			displayTimezone: runtime.getDisplayTimezone(),
			sceneTimezone: scene.chart.timezone,
			originalSceneTimezone: workspace.scene.document.chart.timezone,
			hasAdjustment: settingsPopover.querySelector('[data-host-action="adjustment.qfq"]') !== null,
			hasPriceScale: settingsPopover.querySelector('[data-action="price-scale"]') !== null,
			hasMainSeries: settingsPopover.querySelector('[data-action="main-series"]') !== null,
			annotationPressed: annotationButton.getAttribute('aria-pressed'),
			textPopoverHidden: textPopover.hidden,
			periodRequested: events.some((event) =>
				event.type === 'host-action-requested' && event.actionId === 'period.1d'),
		};
		toolbar.destroy();
		const remaining = document.querySelectorAll(
			'.baron-chart-workspace-toolbar, .baron-chart-workspace-popover, .baron-chart-workspace-tooltip',
		).length;
		runtime.destroy();
		return { ...snapshot, remaining };
	}, chartWorkspaceFixture);

	expect(result).toEqual({
		periods: 2,
		drawingTools: 22,
		expectedDrawingTools: 22,
		mainIndicators: ['MA', 'EMA', 'SMA', 'BOLL', 'SAR', 'BBI'],
		maPressed: 'true',
		displayTimezone: 'UTC',
		sceneTimezone: result.originalSceneTimezone,
		originalSceneTimezone: result.originalSceneTimezone,
		hasAdjustment: true,
		hasPriceScale: true,
		hasMainSeries: true,
		annotationPressed: 'true',
		textPopoverHidden: true,
		periodRequested: true,
		remaining: 0,
	});
});

test('@browser time-series Workspace toolbar keeps 22 tools without main series or log controls', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (workspace) => {
		const {
			createDrawableWorkspaceRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const runtime = await createDrawableWorkspaceRuntime(
			(() => {
				const container = document.createElement('div');
				container.style.width = '1000px';
				container.style.height = '600px';
				document.body.append(container);
				return container;
			})(),
			workspace,
			{ commitMode: 'immediate' },
		);
		const toolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
			{ mainSeriesPresentationControl: 'enabled' },
		);
		const buttons = [
			...toolbar.element.querySelectorAll<HTMLButtonElement>('[data-overlay-type]'),
		];
		const mainSeries = toolbar.element.querySelector('[data-action="main-series"]');
		const scale = toolbar.element.querySelector<HTMLSelectElement>(
			'[data-action="price-scale"]',
		);
		runtime.destroy();
		return {
			buttons: buttons.length,
			mainSeriesHidden: mainSeries === null,
			scaleHidden: scale === null || scale.hidden,
		};
	}, timeSeriesWorkspaceFixture);
	expect(result.buttons).toBe(22);
	expect(result.mainSeriesHidden).toBe(true);
	expect(result.scaleHidden).toBe(true);
});

test('@browser chart controls stay in the main toolbar and Drawing controls use a draggable floating toolbar', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (workspace) => {
		const {
			createDrawingFloatingToolbar,
			createDrawableWorkspaceRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const runtime = await createDrawableWorkspaceRuntime(
			container,
			workspace,
			{ commitMode: 'immediate' },
		);
		const standardToolbar = createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
		);
		const drawingToolbar = createDrawingFloatingToolbar(container, runtime);
		(window as unknown as {
			__runtime: typeof runtime;
			__standardToolbar: typeof standardToolbar;
			__drawingToolbar: typeof drawingToolbar;
		}).__runtime = runtime;
	}, chartWorkspaceFixture);
	// 清空已有 Drawing，避免右键命中干扰。
	await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: { listDrawings(): readonly { readonly id: string }[]; removeDrawing(id: string): boolean };
		}).__runtime;
		for (const drawing of runtime.listDrawings()) {
			runtime.removeDrawing(drawing.id);
		}
	});
	await expect.poll(() => page.evaluate(
		() => (window as unknown as {
			__runtime: { listDrawings(): readonly unknown[] };
		}).__runtime.listDrawings().length,
	)).toBe(0);

	// 常驻工具栏保留 Drawing 创建工具、图表级控件和全局操作。
	expect(await page.locator('#toolbar [data-overlay-type]').count()).toBe(22);
	expect(await page.locator('#toolbar [data-action="delete"]').count()).toBe(0);
	expect(await page.locator('#toolbar [data-action="export"]').count()).toBe(1);
	expect(await page.locator('#toolbar [data-action="price-scale"]').count()).toBe(1);
	expect(await page.locator('#toolbar [data-action="main-series"]').count()).toBe(1);
	for (const action of ['line-style', 'line-width', 'line-color']) {
		expect(await page.locator(`#toolbar [data-action="${action}"]`).count()).toBe(0);
	}
	await expect(page.locator('.baron-drawing-toolbar')).toBeHidden();

	// 创建一条水平线；线会吸附到最近 bar 值，实际像素 y 可能与点击位置不同。
	await page.locator('[data-overlay-type="horizontalStraightLine"]').click();
	const canvas = page.locator('#chart canvas').nth(1);
	await canvas.click({ position: { x: 400, y: 120 } });
	await expect.poll(() => page.evaluate(
		() => (window as unknown as {
			__runtime: { listDrawings(): readonly unknown[] };
		}).__runtime.listDrawings().length,
	)).toBe(1);
	const drawingId = await page.evaluate(() => (window as unknown as {
		__runtime: { listDrawings(): readonly { readonly id: string }[] };
	}).__runtime.listDrawings()[0]!.id);
	await page.evaluate((id) => (window as unknown as {
		__runtime: { selectDrawing(id: string): void };
	}).__runtime.selectDrawing(id), drawingId);
	await expect(page.locator('.baron-drawing-toolbar')).toBeVisible();
	for (const action of [
		'line-style', 'line-width', 'line-color', 'toggle-lock', 'delete',
	]) {
		expect(await page.locator(`.baron-drawing-toolbar [data-action="${action}"]`).count())
			.toBe(1);
	}

	// 对象级样式只修改当前 Drawing。
	await page.locator('.baron-drawing-toolbar [data-action="line-style"]').selectOption('dashed');
	await expect.poll(() => page.evaluate((id) => (window as unknown as {
		__runtime: { getDrawing(id: string): { styles: { line: { style: string } } } };
	}).__runtime.getDrawing(id).styles.line.style, drawingId)).toBe('dashed');
	await page.locator('.baron-drawing-toolbar [data-action="line-width"]').selectOption('2');
	await expect.poll(() => page.evaluate((id) => (window as unknown as {
		__runtime: { getDrawing(id: string): { styles: { line: { size: number } } } };
	}).__runtime.getDrawing(id).styles.line.size, drawingId)).toBe(2);
	await page.locator('.baron-drawing-toolbar [data-action="line-color"]').evaluate(
		(input: HTMLInputElement) => {
			input.value = '#ff0000';
			input.dispatchEvent(new Event('change', { bubbles: true }));
		},
	);
	await expect.poll(() => page.evaluate((id) => {
		const drawing = (window as unknown as {
			__runtime: { getDrawing(id: string): { styles: { line: { style: string; size: number; color: string } } } };
		}).__runtime.getDrawing(id);
		return drawing.styles.line;
	}, drawingId)).toEqual({
		style: 'dashed',
		size: 2,
		color: 'rgba(255, 0, 0, 1)',
	});

	// 浮动工具栏位置可以拖动，并限制在图表可见区域。
	const beforeDrag = await page.locator('.baron-drawing-toolbar').boundingBox();
	const grip = page.locator('.baron-drawing-toolbar [data-action="drag"]');
	const gripBox = await grip.boundingBox();
	expect(beforeDrag).not.toBeNull();
	expect(gripBox).not.toBeNull();
	await page.mouse.move(gripBox!.x + gripBox!.width / 2, gripBox!.y + gripBox!.height / 2);
	await page.mouse.down();
	await page.mouse.move(gripBox!.x + 150, gripBox!.y + 110, { steps: 4 });
	await page.mouse.up();
	const afterDrag = await page.locator('.baron-drawing-toolbar').boundingBox();
	expect(afterDrag!.x).not.toBe(beforeDrag!.x);
	expect(afterDrag!.y).not.toBe(beforeDrag!.y);

	// 右键命中 Drawing 不删除，并且 Baron 不取消 contextmenu 默认行为。
	const hitPoint = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				hitTestDrawing(point: { x: number; y: number }): string | null;
			};
		}).__runtime;
		for (let y = 80; y <= 300; y += 2) {
			for (let x = 300; x <= 600; x += 10) {
				if (runtime.hitTestDrawing({ x, y }) !== null) {
					return { x, y };
				}
			}
		}
		return null;
	});
	expect(hitPoint).not.toBeNull();
	const contextMenuAllowed = await canvas.evaluate((element, point) => {
		const rect = document.querySelector<HTMLElement>('#chart')!.getBoundingClientRect();
		const init = {
			bubbles: true,
			cancelable: true,
			clientX: rect.left + point.x,
			clientY: rect.top + point.y,
			button: 2,
		};
		element.dispatchEvent(new MouseEvent('mousedown', init));
		return element.dispatchEvent(new MouseEvent('contextmenu', init));
	}, hitPoint as { x: number; y: number });
	expect(contextMenuAllowed).toBe(true);
	await expect.poll(() => page.evaluate(
		() => (window as unknown as { __runtime: { listDrawings(): readonly unknown[] } })
			.__runtime.listDrawings().length,
	)).toBe(1);

	// 图表级主序列继续由常驻工具栏控制。
	await page.locator('#toolbar [data-action="main-series"]').selectOption('area');
	await expect.poll(() => page.evaluate(
		() => (window as unknown as {
			__runtime: {
				exportWorkspace(): { scene: { document: { chart: { candle: { type: string } } } } };
			};
		}).__runtime.exportWorkspace().scene.document.chart.candle.type,
	)).toBe('area');

	// 锁定后样式和删除禁用；解锁后可显式删除。
	await page.locator('.baron-drawing-toolbar [data-action="toggle-lock"]').click();
	await expect(page.locator('.baron-drawing-toolbar [data-action="delete"]')).toBeDisabled();
	await page.locator('.baron-drawing-toolbar [data-action="toggle-lock"]').click();
	await page.locator('.baron-drawing-toolbar [data-action="delete"]').click();
	await expect.poll(() => page.evaluate(
		() => (window as unknown as { __runtime: { listDrawings(): readonly unknown[] } })
			.__runtime.listDrawings().length,
	)).toBe(0);
	await expect(page.locator('.baron-drawing-toolbar')).toBeHidden();
});

test('@browser selected Drawing toolbar remains visible inside workspace fullscreen', async ({ page }) => {
	await page.goto('/test/fixture.html');
	await page.evaluate(async (workspace) => {
		const {
			createChartWorkspaceToolbar,
			createDrawingFloatingToolbar,
			createDrawableWorkspaceRuntime,
		} = await import('/src/index.ts');
		const top = document.querySelector<HTMLElement>('#toolbar')!;
		const chart = document.querySelector<HTMLElement>('#chart')!;
		const left = document.createElement('div');
		left.id = 'drawing-toolbar';
		const fullscreenHost = document.createElement('section');
		fullscreenHost.id = 'fullscreen-host';
		document.body.append(fullscreenHost);
		fullscreenHost.append(top, left, chart);
		Object.defineProperty(fullscreenHost, 'requestFullscreen', {
			configurable: true,
			value: async () => {
				Object.defineProperty(document, 'fullscreenElement', {
					configurable: true,
					value: fullscreenHost,
				});
				document.dispatchEvent(new Event('fullscreenchange'));
			},
		});
		Object.defineProperty(document, 'exitFullscreen', {
			configurable: true,
			value: async () => {
				Object.defineProperty(document, 'fullscreenElement', {
					configurable: true,
					value: null,
				});
				document.dispatchEvent(new Event('fullscreenchange'));
			},
		});
		const runtime = await createDrawableWorkspaceRuntime(
			chart,
			workspace,
			{ commitMode: 'immediate' },
		);
		const workspaceToolbar = createChartWorkspaceToolbar(
			{ top, left },
			runtime,
			{ fullscreenTarget: fullscreenHost },
		);
		const drawingToolbar = createDrawingFloatingToolbar(chart, runtime);
		const drawingId = runtime.listDrawings()[0]!.id;
		runtime.selectDrawing(drawingId);
		Object.assign(window, {
			__fullscreenDrawingRuntime: runtime,
			__fullscreenDrawingToolbar: drawingToolbar,
			__fullscreenWorkspaceToolbar: workspaceToolbar,
		});
	}, chartWorkspaceFixture);

	const drawingToolbar = page.locator('.baron-drawing-toolbar');
	await expect(drawingToolbar).toBeVisible();
	await expect.poll(() => drawingToolbar.evaluate((element) => element.parentElement?.tagName))
		.toBe('BODY');

	await page.locator('#fullscreen-host [data-action="fullscreen"]').click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('fullscreen-host');
	await expect.poll(() => drawingToolbar.evaluate((element) => element.parentElement?.id))
		.toBe('fullscreen-host');
	await expect(drawingToolbar).toBeVisible();

	await page.locator('#fullscreen-host [data-action="settings"]').click();
	const settingsPopover = page.locator('[id^="baron-workspace-settings-"]');
	await expect.poll(() => settingsPopover.evaluate((element) => element.parentElement?.id))
		.toBe('fullscreen-host');
	await expect(settingsPopover).toBeVisible();

	await drawingToolbar.locator('[data-action="line-style"]').selectOption('dotted');
	await expect.poll(() => page.evaluate(() => {
		const runtime = (window as unknown as {
			__fullscreenDrawingRuntime: {
				getSelectedDrawingId(): string | undefined;
				getDrawing(id: string): { styles: { line: { style: string } } };
			};
		}).__fullscreenDrawingRuntime;
		const drawingId = runtime.getSelectedDrawingId()!;
		return runtime.getDrawing(drawingId).styles.line.style;
	})).toBe('dotted');

	await page.locator('#fullscreen-host [data-action="fullscreen"]').click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
	await expect.poll(() => settingsPopover.evaluate((element) => element.parentElement?.tagName))
		.toBe('BODY');
	await expect.poll(() => drawingToolbar.evaluate((element) => element.parentElement?.tagName))
		.toBe('BODY');
	await expect(drawingToolbar).toBeVisible();
});

test('@browser composite Drawing tool exits its selected state after geometry completion', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const workspace = structuredClone(chartWorkspaceFixture);
	workspace.drawings.drawings = [];
	await page.evaluate(async (input) => {
		const {
			createChartWorkspaceToolbar,
			createDrawableWorkspaceRuntime,
		} = await import('/src/index.ts');
		const events: Array<{ readonly type: string; readonly operation?: string }> = [];
		const runtime = await createDrawableWorkspaceRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			input,
			{
				commitMode: 'host-confirmed',
				onEvent: (event) => events.push(event),
			},
		);
		const left = document.createElement('div');
		document.body.append(left);
		createChartWorkspaceToolbar(
			{
				top: document.querySelector<HTMLElement>('#toolbar')!,
				left,
			},
			runtime,
			{ fullscreenControl: 'hidden' },
		);
		Object.assign(window, {
			__singleUseDrawingRuntime: runtime,
			__singleUseDrawingEvents: events,
		});
	}, workspace);

	const button = page.locator('[data-overlay-type="horizontalStraightLine"]');
	await button.click();
	await expect(button).toHaveAttribute('aria-pressed', 'true');
	await page.locator('#chart canvas').nth(1).click({ position: { x: 400, y: 120 } });
	await expect.poll(() => page.evaluate(() =>
		(window as unknown as {
			__singleUseDrawingEvents: Array<{ readonly type: string; readonly operation?: string }>;
		}).__singleUseDrawingEvents.some(
			(event) => event.type === 'drawing-candidate' && event.operation === 'create',
		),
	)).toBe(true);
	await expect(button).toHaveAttribute('aria-pressed', 'false');
	await expect.poll(() => page.evaluate(() =>
		(window as unknown as {
			__singleUseDrawingRuntime: { getDrawingMutationState(): string };
		}).__singleUseDrawingRuntime.getDrawingMutationState(),
	)).toBe('busy');
});

test('@browser clear-all removes every unlocked Drawing and keeps locked ones', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const workspace = structuredClone(chartWorkspaceFixture);
	const lockedDrawing = workspace.drawings.drawings[0];
	lockedDrawing.locked = true;
	await page.evaluate(async (workspace) => {
		const {
			createDrawableWorkspaceRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const runtime = await createDrawableWorkspaceRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			workspace,
			{ commitMode: 'immediate' },
		);
		createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
		);
		(window as unknown as { __runtime: typeof runtime }).__runtime = runtime;
	}, workspace);
	await expect.poll(() => page.evaluate(
		() => (window as unknown as {
			__runtime: { listDrawings(): readonly unknown[] };
		}).__runtime.listDrawings().length,
	)).toBe(22);
	expect(await page.locator('[data-action="clear-all"]').count()).toBe(1);
	await page.locator('[data-action="clear-all"]').click();
	await expect.poll(() => page.evaluate(
		() => {
			const drawings = (window as unknown as {
				__runtime: { listDrawings(): readonly { readonly id: string; readonly locked: boolean }[] };
			}).__runtime.listDrawings();
			return {
				length: drawings.length,
				id: drawings[0]?.id,
				locked: drawings[0]?.locked,
			};
		},
	)).toEqual({ length: 1, id: lockedDrawing.id, locked: true });
});

test('@browser M1 toolbar creates, selects, exports, and deletes a horizontal line through real DOM', async ({ page }) => {
	const createdId = 'overlay-horizontalStraightLine-0';
	const drawPosition = { x: 500, y: 170 };
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const {
			createDrawingFloatingToolbar,
			createKLineSceneRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		createStandardToolbar(
			document.querySelector<HTMLElement>('#toolbar')!,
			runtime,
			{ downloadFileName: 'm1-scene.json' },
		);
		createDrawingFloatingToolbar(
			document.querySelector<HTMLElement>('#chart')!,
			runtime,
		);
		Object.assign(window, { __baronM1ToolbarRuntime: runtime });
	}, m1Scene);

	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	const horizontalLineButton = page.locator(
		'[data-overlay-type="horizontalStraightLine"]',
	);
	await expect(horizontalLineButton).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(horizontalLineButton).toHaveAttribute('aria-pressed', 'true');

	const canvas = page.locator('#chart canvas').nth(1);
	await expect(canvas).toBeVisible();
	await canvas.click({ position: drawPosition });
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronM1ToolbarRuntime: { listOverlays(): readonly unknown[] };
		}
	).__baronM1ToolbarRuntime.listOverlays().length)).toBe(2);

	await canvas.click({ position: drawPosition });
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronM1ToolbarRuntime: { getSelectedOverlayId(): string | undefined };
		}
	).__baronM1ToolbarRuntime.getSelectedOverlayId())).toBe(createdId);

	const downloadPromise = page.waitForEvent('download');
	await page.locator('[data-action="export"]').click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('m1-scene.json');
	const downloadPath = await download.path();
	expect(downloadPath).not.toBeNull();
	const exported = JSON.parse(await readFile(downloadPath!, 'utf8')) as {
		overlays: Array<{
			id: string;
			type: string;
			anchor?: { value?: number };
		}>;
	};
	expect(exported.overlays.map((overlay) => overlay.id)).toEqual([
		'overlay-m1-horizontal-reference',
		createdId,
	]);
	expect(exported.overlays[1]).toEqual(expect.objectContaining({
		id: createdId,
		type: 'horizontalStraightLine',
	}));
	expect(Number.isFinite(exported.overlays[1]!.anchor?.value)).toBe(true);

	await page.locator('.baron-drawing-toolbar [data-action="delete"]').click();
	await expect.poll(() => page.evaluate(() => (
		window as unknown as {
			__baronM1ToolbarRuntime: {
				listOverlays(): Array<{ id: string }>;
			};
		}
	).__baronM1ToolbarRuntime.listOverlays().map((overlay) => overlay.id)))
		.toEqual(['overlay-m1-horizontal-reference']);

	const cleanup = await page.evaluate(() => {
		(
			window as unknown as {
				__baronM1ToolbarRuntime: { destroy(): void };
			}
		).__baronM1ToolbarRuntime.destroy();
		return {
			chartChildren: document.querySelector('#chart')!.childElementCount,
			toolbarChildren: document.querySelector('#toolbar')!.childElementCount,
			tooltips: document.querySelectorAll('.baron-kline-toolbar-tooltip').length,
		};
	});
	expect(cleanup).toEqual({
		chartChildren: 0,
		toolbarChildren: 0,
		tooltips: 0,
	});
});

test('@browser M1 horizontal line toolbar supports the touch creation path', async ({ browser }) => {
	const context = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 1200, height: 800 },
	});
	try {
		const page = await context.newPage();
		await page.goto('/test/fixture.html');
		await page.evaluate(async (scene) => {
			const {
				createKLineSceneRuntime,
				createStandardToolbar,
			} = await import('/src/index.ts');
			const value = structuredClone(scene);
			value.overlays = [];
			const runtime = await createKLineSceneRuntime(
				document.querySelector<HTMLElement>('#chart')!,
				value,
			);
			createStandardToolbar(
				document.querySelector<HTMLElement>('#toolbar')!,
				runtime,
			);
			Object.assign(window, { __baronM1TouchRuntime: runtime });
		}, m1Scene);

		await page.locator('[data-overlay-type="horizontalStraightLine"]').tap();
		const canvas = page.locator('#chart canvas').nth(1);
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		await page.touchscreen.tap(box!.x + 500, box!.y + 170);
		await expect.poll(() => page.evaluate(() => (
			window as unknown as {
				__baronM1TouchRuntime: { listOverlays(): readonly unknown[] };
			}
		).__baronM1TouchRuntime.listOverlays().length)).toBe(1);

		const result = await page.evaluate(() => {
			const runtime = (
				window as unknown as {
					__baronM1TouchRuntime: {
						destroy(): void;
						listOverlays(): Array<{
							id: string;
							type: string;
							anchor: { value: number };
						}>;
					};
				}
			).__baronM1TouchRuntime;
			const overlay = runtime.listOverlays()[0]!;
			runtime.destroy();
			return {
				overlay,
				chartChildren: document.querySelector('#chart')!.childElementCount,
				toolbarChildren: document.querySelector('#toolbar')!.childElementCount,
			};
		});
		expect(result.overlay.id).toBe('overlay-horizontalStraightLine-0');
		expect(result.overlay.type).toBe('horizontalStraightLine');
		expect(Number.isFinite(result.overlay.anchor.value)).toBe(true);
		expect(result.chartChildren).toBe(0);
		expect(result.toolbarChildren).toBe(0);
	} finally {
		await context.close();
	}
});
