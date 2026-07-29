import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');
const m1Scene = loadScene('m1-candle-horizontal-line.json');

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

	expect(result.types).toEqual(result.expected);
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
			...toolbar.element.querySelectorAll<HTMLButtonElement>('[data-action="delete"], [data-action="export"]'),
		];
		overlayButtons[7]!.click();
		const toolbarRect = toolbar.element.getBoundingClientRect();
		const chartRect = chartRoot.getBoundingClientRect();
		const firstIcon = overlayButtons[0]!.querySelector('svg');
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
		'画笔',
		'简易标注',
		'简易标签',
		'矩形',
		'箭头',
		'十字线',
		'注释框',
		'文本',
	]);
	expect(result.actions).toEqual(['删除选中标注', '导出场景']);
	expect(result.groups).toEqual([
		'水平线',
		'垂直线',
		'趋势线',
		'价格与分析',
		'标注',
		'形状与文本',
		'操作',
	]);
	expect(result.buttonText).toEqual(Array.from({ length: 23 }, () => ''));
	expect(result.viewBox).toBe('0 0 24 24');
	expect(result.strokeWidth).toBe('2');
	expect(result.buttonSize).toEqual({ width: '34px', height: '34px' });
	expect(result.iconSize).toEqual({ width: '19px', height: '19px' });
	expect(result.pressed[7]).toBe('true');
	expect(result.pressed.filter((value) => value === 'true')).toHaveLength(1);
	expect(result.hasTextInput).toBe(true);
	expect(result.chartGap).toBe(0);
	expect(result.hasViewport).toBe(true);
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

	await page.locator('[data-overlay-type="verticalSegment"]').focus();
	await expect(tooltip.locator('strong')).toHaveText('垂直线段');
	await expect(tooltip.locator('code')).toHaveText('verticalSegment');
});

test('@browser toolbar deletes only an unlocked selected Overlay and revokes export URLs', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const result = await page.evaluate(async (scene) => {
		const {
			createKLineSceneRuntime,
			createStandardToolbar,
			DEFAULT_OVERLAY_STYLES,
		} = await import('/src/index.ts');
		const runtime = await createKLineSceneRuntime(
			document.querySelector<HTMLElement>('#chart')!,
			scene,
		);
		const removed: string[] = [];
		const urls: string[] = [];
		runtime.getSelectedOverlayId = () => 'overlay-selected';
		runtime.getOverlay = () => ({
			id: 'overlay-selected',
			type: 'segment',
			paneId: 'pane-candle',
			visible: true,
			locked: false,
			zLevel: 0,
			mode: 'normal',
			styles: DEFAULT_OVERLAY_STYLES,
			points: [
				{ timestamp: 1784736000000, value: 12.4 },
				{ timestamp: 1784822400000, value: 12.7 },
			],
		});
		runtime.removeOverlay = ((id: string) => {
			removed.push(id);
			return true;
		}) as typeof runtime.removeOverlay;
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
		toolbar.element.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
		toolbar.element.querySelector<HTMLButtonElement>('[data-action="export"]')!.click();
		runtime.destroy();
		return { removed, urls };
	}, minimalScene);

	expect(result.removed).toEqual(['overlay-selected']);
	expect(result.urls).toEqual(['created', 'clicked', 'revoked']);
});

test('@browser M1 toolbar creates, selects, exports, and deletes a horizontal line through real DOM', async ({ page }) => {
	const createdId = 'overlay-horizontalStraightLine-0';
	const drawPosition = { x: 500, y: 170 };
	await page.goto('/test/fixture.html');
	await page.evaluate(async (scene) => {
		const {
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

	await page.locator('[data-action="delete"]').click();
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
