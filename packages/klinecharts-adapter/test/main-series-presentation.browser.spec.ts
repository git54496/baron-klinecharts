import { expect, test, type Page } from '@playwright/test';

const chartWorkspace = JSON.parse(
	await readFixture('workspaces/chart-minimal.json'),
);

async function readFixture(path: string): Promise<string> {
	const { readFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	return readFile(join(process.cwd(), '..', '..', 'tests', 'fixtures', path), 'utf8');
}

type FaultMode = 'none' | 'throw-once' | 'noop' | 'partial' | 'throw-always';

async function installFault(page: Page, mode: FaultMode): Promise<void> {
	await page.evaluate(async ({ mode, chartWorkspace }) => {
		const { createEngine } = await import('/src/engine.ts');
		const probeContainer = document.createElement('div');
		probeContainer.style.width = '200px';
		probeContainer.style.height = '120px';
		document.body.append(probeContainer);
		const scene = structuredClone(chartWorkspace.scene.document);
		const handle = await createEngine(probeContainer, scene);
		const prototype = Object.getPrototypeOf(handle.chart);
		const originalSetStyles = prototype.setStyles;
		let applyCount = 0;
		prototype.setStyles = function (value: unknown) {
			applyCount += 1;
			(window as unknown as Record<string, unknown>).__styleApplyCount = applyCount;
			if (mode === 'throw-once' && applyCount === 1) {
				throw new Error('injected setStyles failure');
			}
			if (mode === 'throw-always') {
				throw new Error('injected setStyles failure');
			}
			if (mode === 'noop') {
				return;
			}
			if (mode === 'partial') {
				if (applyCount === 1) {
					const candle = (value as { candle?: { type?: string } })?.candle;
					originalSetStyles.call(this, {
						candle: {
							type: candle?.type === 'area' ? 'candle_solid' : 'area',
						},
					});
					return;
				}
			}
			return originalSetStyles.call(this, value);
		};
		(window as unknown as Record<string, unknown>).__faultVerified = true;
		handle.module.dispose(probeContainer);
		probeContainer.remove();
		(window as unknown as Record<string, unknown>).__styleApplyCount = 0;
	}, { mode, chartWorkspace });
}

async function installAdapter(page: Page, mode: FaultMode): Promise<void> {
	await page.goto('/test/fixture.html');
	await installFault(page, mode);
	await page.evaluate(async (chartWorkspace) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		const container = document.querySelector<HTMLElement>('#chart')!;
		const adapter = await KLineChartsSceneAdapter.createWorkspace(
			container,
			chartWorkspace,
		);
		(window as unknown as Record<string, unknown>).__adapter = adapter;
	}, chartWorkspace);
}

function adapterHandle(page: Page): Promise<unknown> {
	return page.evaluate(() => (window as unknown as Record<string, unknown>).__adapter);
}

test('@browser candle→area→candle keeps the same Chart and Drawing bytes', async ({ page }) => {
	await installAdapter(page, 'none');
	const result = await page.evaluate(async () => {
		const adapter = (window as unknown as {
			__adapter: {
				applyMainSeriesPresentation(
					presentation: { readonly type: string },
				): { readonly activeType: string };
				listDrawings(): readonly unknown[];
				getDrawing(id: string): unknown;
				restoreDrawings(drawings: readonly unknown[]): void;
			};
		}).__adapter;
		const snapshot = {
			id: 'drawing-horizontalStraightLine-0',
			type: 'horizontalStraightLine',
			target: { paneRole: 'candle', yAxisRole: 'primary' },
			geometry: { value: 12.55 },
			styles: {
				line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
				fill: { color: 'rgba(41, 98, 255, 0.15)' },
				text: {
					color: 'rgba(255, 255, 255, 1)', size: 12, family: 'Baron Sans',
					weight: 'normal', backgroundColor: 'rgba(41, 98, 255, 1)',
					borderColor: 'rgba(41, 98, 255, 1)',
				},
			},
			locked: false, visible: true, zLevel: 0, mode: 'normal',
		};
		adapter.restoreDrawings([snapshot]);
		const before = JSON.stringify(adapter.getDrawing(snapshot.id));
		const area = adapter.applyMainSeriesPresentation({
			type: 'area',
			value: 'close',
			line: { color: 'rgba(41, 98, 255, 1)', size: 2 },
			backgroundColor: 'rgba(0, 0, 0, 0)',
			smooth: false,
			pointVisible: false,
		});
		const afterArea = JSON.stringify(adapter.getDrawing(snapshot.id));
		const candle = adapter.applyMainSeriesPresentation({
			type: 'candle_solid',
		});
		const afterCandle = JSON.stringify(adapter.getDrawing(snapshot.id));
		return {
			areaType: area.activeType,
			candleType: candle.activeType,
			unchangedThroughArea: before === afterArea,
			unchangedThroughCandle: afterArea === afterCandle,
			listedCount: adapter.listDrawings().length,
		};
	});
	expect(result.areaType).toBe('area');
	expect(result.candleType).toBe('candle_solid');
	expect(result.unchangedThroughArea).toBe(true);
	expect(result.unchangedThroughCandle).toBe(true);
	expect(result.listedCount).toBe(1);
});

test('@browser switches presentation while a Drawing creation is in progress', async ({ page }) => {
	await installAdapter(page, 'none');
	const startResult = await page.evaluate(() => {
		const adapter = (window as unknown as {
			__adapter: {
				startDrawing(request: unknown): string;
			};
		}).__adapter;
		return adapter.startDrawing({
			id: 'mid-horizontal',
			type: 'horizontalStraightLine',
			target: { paneRole: 'candle', yAxisRole: 'primary' },
			styles: {
				line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
				fill: { color: 'rgba(41, 98, 255, 0.15)' },
				text: {
					color: 'rgba(255, 255, 255, 1)', size: 12, family: 'Baron Sans',
					weight: 'normal', backgroundColor: 'rgba(41, 98, 255, 1)',
					borderColor: 'rgba(41, 98, 255, 1)',
				},
			},
		});
	});
	expect(startResult).toBe('mid-horizontal');
	await page.mouse.move(300, 300);
	await page.mouse.down();
	await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));
	const mid = await page.evaluate(() => {
		const adapter = (window as unknown as {
			__adapter: {
				applyMainSeriesPresentation(presentation: unknown): { readonly activeType: string };
			};
		}).__adapter;
		return adapter.applyMainSeriesPresentation({
			type: 'area',
			value: 'close',
			line: { color: 'rgba(41, 98, 255, 1)', size: 2 },
			backgroundColor: 'rgba(0, 0, 0, 0)',
			smooth: false,
			pointVisible: false,
		});
	});
	expect(mid.activeType).toBe('area');
	await page.mouse.up();
	await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));
	const finalState = await page.evaluate(() => {
		const adapter = (window as unknown as {
			__adapter: {
				applyMainSeriesPresentation(presentation: unknown): { readonly activeType: string };
				getDrawing(id: string): { readonly id: string; readonly geometry: unknown } | undefined;
			};
		}).__adapter;
		const back = adapter.applyMainSeriesPresentation({ type: 'candle_solid' });
		const drawing = adapter.getDrawing('mid-horizontal');
		return { back: back.activeType, drawing };
	});
	expect(finalState.back).toBe('candle_solid');
	expect(finalState.drawing?.id).toBe('mid-horizontal');
});

for (const [mode, expectedCode] of [
	['throw-once', 'MAIN_SERIES_PRESENTATION_APPLY_FAILED'],
	['noop', 'MAIN_SERIES_PRESENTATION_APPLY_FAILED'],
	['partial', 'MAIN_SERIES_PRESENTATION_APPLY_FAILED'],
	['throw-always', 'MAIN_SERIES_PRESENTATION_ROLLBACK_FAILED'],
] as const) {
	test(`@browser presentation fault ${mode} yields ${expectedCode}`, async ({ page }) => {
		await installAdapter(page, mode);
		const result = await page.evaluate(async () => {
			const faultVerified = (window as unknown as {
				__faultVerified?: boolean;
			}).__faultVerified;
			const adapter = (window as unknown as {
				__adapter: {
					applyMainSeriesPresentation(presentation: unknown): { readonly activeType: string };
					listDrawings(): readonly unknown[];
				};
			}).__adapter;
			const area = {
				type: 'area',
				value: 'close',
				line: { color: 'rgba(41, 98, 255, 1)', size: 2 },
				backgroundColor: 'rgba(0, 0, 0, 0)',
				smooth: false,
				pointVisible: false,
			};
			let code: string | null = null;
			let message = '';
			try {
				adapter.applyMainSeriesPresentation(area);
			} catch (error) {
				code = (error as { code?: string }).code ?? null;
				message = (error as Error).message;
			}
			let afterRecovery: string | null = null;
			if (code === 'MAIN_SERIES_PRESENTATION_APPLY_FAILED') {
				try {
					afterRecovery = adapter.applyMainSeriesPresentation({
						type: 'candle_solid',
					}).activeType;
				} catch (error) {
					afterRecovery = `error:${(error as { code?: string }).code ?? 'unknown'}`;
				}
			}
			const styleApplyCount = (window as unknown as {
				__styleApplyCount?: number;
			}).__styleApplyCount ?? 0;
			return {
				code,
				message,
				afterRecovery,
				listed: adapter.listDrawings().length,
				faultVerified,
				styleApplyCount,
			};
		});
		expect(result.faultVerified).toBe(true);
		expect(result.styleApplyCount).toBeGreaterThan(0);
		expect(result.code).toBe(expectedCode);
		if (expectedCode === 'MAIN_SERIES_PRESENTATION_ROLLBACK_FAILED') {
			expect(result.message).toContain('destroy-only');
			const terminated = await page.evaluate(() => {
				const adapter = (window as unknown as {
					__adapter: {
						applyMainSeriesPresentation(presentation: unknown): unknown;
					};
				}).__adapter;
				try {
					adapter.applyMainSeriesPresentation({ type: 'candle_solid' });
					return 'no-error';
				} catch (error) {
					return (error as { code?: string }).code ?? 'unknown';
				}
			});
			expect(terminated).toBe('MAIN_SERIES_PRESENTATION_ROLLBACK_FAILED');
		} else {
			expect(result.afterRecovery).toBe('candle_solid');
		}
	});
}

test('@browser rejects Workspace charts carrying additional-axis targets', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const workspace = structuredClone(chartWorkspace);
	workspace.drawings.coordinateSystem.valueAxes = [
		{ paneRole: 'candle', yAxisRole: 'primary', valuePrecision: 2 },
		{ paneRole: 'candle', yAxisRole: 'additional', valuePrecision: 6 },
	];
	workspace.binding.valueAxes = workspace.drawings.coordinateSystem.valueAxes;
	workspace.drawings.drawings[0].target = {
		paneRole: 'candle',
		yAxisRole: 'additional',
	};
	const error = await page.evaluate(async (workspace) => {
		const { KLineChartsSceneAdapter } = await import('/src/index.ts');
		try {
			await KLineChartsSceneAdapter.createWorkspace(
				document.querySelector<HTMLElement>('#chart')!,
				workspace,
			);
			return null;
		} catch (caught) {
			return { code: (caught as { code?: string }).code, path: (caught as { path?: string }).path };
		}
	}, workspace);
	expect(error?.code).toBe('DRAWING_TARGET_INVALID');
});
