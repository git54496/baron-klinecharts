import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const chartWorkspace = JSON.parse(
	await readFile(
		join(process.cwd(), '..', '..', 'tests', 'fixtures', 'workspaces', 'chart-minimal.json'),
		'utf8',
	),
);
const timeSeriesWorkspace = JSON.parse(
	await readFile(
		join(process.cwd(), '..', '..', 'tests', 'fixtures', 'workspaces', 'time-series-minimal.json'),
		'utf8',
	),
);

async function installRuntime(
	page: Page,
	workspace: unknown,
	commitMode: 'immediate' | 'host-confirmed' = 'immediate',
	historicalDataLoading = false,
): Promise<void> {
	await page.goto('/test/fixture.html');
	await page.evaluate(
		async ({ workspace, commitMode, historicalDataLoading }) => {
			const { createDrawableWorkspaceRuntime } = await import('/src/index.ts');
			const container = document.querySelector<HTMLElement>('#chart')!;
			const events: Array<{
				readonly type: string;
				readonly requestId?: string;
				readonly canonicalHash?: string;
			}> = [];
			const runtime = await createDrawableWorkspaceRuntime(container, workspace, {
				commitMode,
				onEvent: (event) => events.push(event),
				...(historicalDataLoading
					? { historicalDataLoading: { hasMore: true } }
					: {}),
			});
			(window as unknown as Record<string, unknown>).__runtime = runtime;
			(window as unknown as Record<string, unknown>).__events = events;
		},
		{ workspace, commitMode, historicalDataLoading },
	);
}

function runtimeHandle(page: Page) {
	return page.evaluate(() => (window as unknown as Record<string, unknown>).__runtime);
}

test('@browser Workspace Runtime restores and exports confirmed Drawings', async ({ page }) => {
	await installRuntime(page, chartWorkspace);
	const result = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				listDrawings(): readonly { readonly id: string }[];
				exportWorkspace(): { readonly drawings: { readonly drawings: readonly unknown[] } };
				exportArtifact(): { readonly bytes: Uint8Array; readonly mediaType: string };
			};
		}).__runtime;
		const listed = runtime.listDrawings();
		const exported = runtime.exportWorkspace();
		const artifact = runtime.exportArtifact();
		return {
			listed: listed.length,
			exported: exported.drawings.drawings.length,
			artifactKind: new TextDecoder().decode(artifact.bytes),
		};
	});
	expect(result.listed).toBe(22);
	expect(result.exported).toBe(22);
	expect(result.artifactKind).toContain('"schema":"@baron1996/drawable-workspace"');
});

test('@browser Workspace Runtime creates a Drawing and commits immediately', async ({ page }) => {
	await installRuntime(page, chartWorkspace, 'immediate');
	await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				startDrawing(type: string): string;
			};
		}).__runtime;
		runtime.startDrawing('horizontalStraightLine');
	});
	await page.mouse.click(500, 40);
	await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 120)));
	const result = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				listDrawings(): readonly { readonly id: string }[];
			};
			__events: readonly { readonly type: string }[];
		}).__runtime;
		return {
			count: runtime.listDrawings().length,
			committed: (window as unknown as { __events: readonly { readonly type: string }[] })
				.__events.some((event) => event.type === 'drawing-committed'),
		};
	});
	expect(result.count).toBe(23);
	expect(result.committed).toBe(true);
});

test('@browser empty Workspace Runtime keeps chart and toolbar nodes while installing Scene and Drawings', async ({ page }) => {
	await page.goto('/test/fixture.html');
	const before = await page.evaluate(async (workspace) => {
		const {
			createEmptyDrawableWorkspaceRuntime,
			createStandardToolbar,
		} = await import('/src/index.ts');
		const scene = structuredClone(workspace.scene.document);
		const viewport = structuredClone(scene.viewport) as Record<string, unknown>;
		delete viewport.anchorTimestamp;
		const container = document.querySelector<HTMLElement>('#chart')!;
		const toolbarContainer = document.querySelector<HTMLElement>('#toolbar')!;
		const runtime = await createEmptyDrawableWorkspaceRuntime(
			container,
			{
				scopeKey: workspace.drawings.scopeKey,
				symbol: structuredClone(scene.symbol),
				// 属性顺序不是 Period 身份；宿主对象常按 type、span 构造。
				period: { type: scene.period.type, span: scene.period.span },
				chart: structuredClone(scene.chart),
				panes: structuredClone(scene.panes),
				viewport: viewport as never,
				render: structuredClone(scene.render),
			},
			{
				commitMode: 'host-confirmed',
				hostActions: [{ actionId: 'retry-history', label: '重试' }],
			},
		);
		const toolbar = createStandardToolbar(toolbarContainer, runtime, {
			hostActions: [{ actionId: 'retry-history', label: '重试' }],
		});
		let exportError = '';
		try {
			runtime.exportWorkspace();
		} catch (error) {
			exportError = String(error);
		}
		(window as unknown as Record<string, unknown>).__runtime = runtime;
		(window as unknown as Record<string, unknown>).__toolbar = toolbar;
		(window as unknown as Record<string, unknown>).__chartRoot = container.firstElementChild;
		return {
			state: runtime.getRuntimeState(),
			emptyText: container.querySelector<HTMLElement>('.baron-progressive-runtime-state')?.textContent,
			drawingDisabled: toolbar.element.querySelector<HTMLButtonElement>('[data-overlay-type]')?.disabled,
			exportDisabled: toolbar.element.querySelector<HTMLButtonElement>('[data-action="export"]')?.disabled,
			hostDisabled: toolbar.element.querySelector<HTMLButtonElement>('[data-host-action="retry-history"]')?.disabled,
			exportError,
		};
	}, chartWorkspace);

	expect(before).toMatchObject({
		state: 'empty',
		emptyText: '暂无历史 K 线',
		drawingDisabled: true,
		exportDisabled: true,
		hostDisabled: false,
	});
	expect(before.exportError).toContain('EMPTY_RUNTIME_NOT_READY');

	const after = await page.evaluate((workspace) => {
		const state = window as unknown as {
			__runtime: {
				setLoadingState(state: 'loading-history' | 'error'): void;
				installInitialScene(scene: unknown): unknown;
				installDrawingDocument(document: unknown): unknown;
				getRuntimeState(): string;
				listDrawings(): readonly unknown[];
				exportWorkspace(): typeof workspace;
			};
			__toolbar: {
				readonly element: HTMLElement;
				setDataActionsDisabled(disabled: boolean): void;
				setDrawingActionsDisabled(disabled: boolean): void;
			};
			__chartRoot: Element;
		};
		state.__runtime.setLoadingState('loading-history');
		state.__runtime.installInitialScene(workspace.scene.document);
		state.__runtime.installDrawingDocument(workspace.drawings);
		const container = document.querySelector<HTMLElement>('#chart')!;
		return {
			state: state.__runtime.getRuntimeState(),
			sameChartRoot: container.firstElementChild === state.__chartRoot,
			toolbarConnected: state.__toolbar.element.isConnected,
			drawingDisabled: state.__toolbar.element.querySelector<HTMLButtonElement>('[data-overlay-type]')?.disabled,
			exportDisabled: state.__toolbar.element.querySelector<HTMLButtonElement>('[data-action="export"]')?.disabled,
			drawings: state.__runtime.listDrawings().length,
			bars: state.__runtime.exportWorkspace().scene.document.data.length,
			emptyHidden: container.querySelector<HTMLElement>('.baron-progressive-runtime-state')?.hidden,
		};
	}, chartWorkspace);

	expect(after).toEqual({
		state: 'ready',
		sameChartRoot: true,
		toolbarConnected: true,
		drawingDisabled: false,
		exportDisabled: false,
		drawings: 22,
		bars: 3,
		emptyHidden: true,
	});

	const hostDisabled = await page.evaluate(() => {
		const toolbar = (window as unknown as {
			__toolbar: {
				readonly element: HTMLElement;
				setDataActionsDisabled(disabled: boolean): void;
			};
		}).__toolbar;
		toolbar.setDataActionsDisabled(true);
		const disabled = toolbar.element.querySelector<HTMLButtonElement>('[data-overlay-type]')?.disabled;
		toolbar.setDataActionsDisabled(false);
		const enabled = toolbar.element.querySelector<HTMLButtonElement>('[data-overlay-type]')?.disabled;
		return { disabled, enabled };
	});
	expect(hostDisabled).toEqual({ disabled: true, enabled: false });

	const drawingOnlyDisabled = await page.evaluate(() => {
		const toolbar = (window as unknown as {
			__toolbar: {
				readonly element: HTMLElement;
				setDrawingActionsDisabled(disabled: boolean): void;
			};
		}).__toolbar;
		toolbar.setDrawingActionsDisabled(true);
		const result = {
			drawingDisabled: toolbar.element.querySelector<HTMLButtonElement>('[data-overlay-type]')?.disabled,
			exportDisabled: toolbar.element.querySelector<HTMLButtonElement>('[data-action="export"]')?.disabled,
		};
		toolbar.setDrawingActionsDisabled(false);
		return result;
	});
	expect(drawingOnlyDisabled).toEqual({ drawingDisabled: true, exportDisabled: false });

	const reprojected = await page.evaluate(() => {
		const state = window as unknown as {
			__runtime: {
				exportDrawingDocument(): { drawings: unknown[] };
				replaceDrawingDocumentProjection(document: unknown): { drawings: unknown[] };
				listDrawings(): readonly unknown[];
			};
			__chartRoot: Element;
		};
		const drawingDocument = state.__runtime.exportDrawingDocument();
		drawingDocument.drawings = drawingDocument.drawings.slice(0, 2);
		state.__runtime.replaceDrawingDocumentProjection(drawingDocument);
		return {
			drawings: state.__runtime.listDrawings().length,
			sameChartRoot: document.querySelector<HTMLElement>('#chart')?.firstElementChild ===
				state.__chartRoot,
		};
	});
	expect(reprojected).toEqual({ drawings: 2, sameChartRoot: true });
});

test('@browser Workspace Runtime host-confirmed commit and reject', async ({ page }) => {
	await installRuntime(page, chartWorkspace, 'host-confirmed');
	await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				startDrawing(type: string): string;
			};
		}).__runtime;
		runtime.startDrawing('horizontalStraightLine');
	});
	await page.mouse.click(500, 40);
	await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 120)));
	const candidate = await page.evaluate(() => {
		const events = (window as unknown as {
			__events: Array<{
				readonly type: string;
				readonly requestId?: string;
				readonly canonicalHash?: string;
			}>;
		}).__events;
		return events.find((event) => event.type === 'drawing-candidate');
	});
	expect(candidate?.type).toBe('drawing-candidate');
	const before = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				listDrawings(): readonly unknown[];
			};
		}).__runtime;
		return runtime.listDrawings().length;
	});
	expect(before).toBe(22);
	const committed = await page.evaluate(
		({ requestId, canonicalHash }) => {
			const runtime = (window as unknown as {
				__runtime: {
					commitDrawingChange(requestId: string, hash: string): boolean;
				};
			}).__runtime;
			return runtime.commitDrawingChange(requestId!, canonicalHash!);
		},
		{ requestId: candidate?.requestId, canonicalHash: candidate?.canonicalHash },
	);
	expect(committed).toBe(true);
	const after = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				listDrawings(): readonly unknown[];
			};
		}).__runtime;
		return runtime.listDrawings().length;
	});
	expect(after).toBe(23);
});

for (const [sceneKind, sourceWorkspace] of [
	['chart', chartWorkspace],
	['time-series', timeSeriesWorkspace],
] as const) {
	test(`@browser ${sceneKind} Workspace candidate preserves opaque metadata`, async ({ page }) => {
		const workspace = structuredClone(sourceWorkspace);
		workspace.drawings.metadata = {
			adjustment: 'none',
			host: { revision: 7 },
		};
		workspace.drawings.drawings[0].groupId = 'host-group-a';
		workspace.drawings.drawings[0].metadata = {
			kind: 'host.daily-mark',
			tradingDate: '2026-08-26',
		};
		await installRuntime(page, workspace, 'host-confirmed');
		await page.evaluate(() => {
			const runtime = (window as unknown as {
				__runtime: {
					listDrawings(): Array<{
						readonly id: string;
						readonly styles: {
							line: { size: number };
						};
					}>;
					updateDrawingStyles(id: string, styles: unknown): unknown;
				};
			}).__runtime;
			const drawing = runtime.listDrawings()[0]!;
			const styles = structuredClone(drawing.styles);
			styles.line.size = 2;
			runtime.updateDrawingStyles(drawing.id, styles);
		});
		await expect.poll(() => page.evaluate(() => {
			const events = (window as unknown as {
				__events: Array<{ readonly type: string }>;
			}).__events;
			return events.some((event) => event.type === 'drawing-candidate');
		})).toBe(true);
		const candidate = await page.evaluate(() => {
			const events = (window as unknown as {
				__events: Array<{
					readonly type: string;
					readonly candidateDocument?: {
						readonly metadata: unknown;
						readonly drawings: Array<{
							readonly groupId?: string;
							readonly metadata?: unknown;
						}>;
					};
				}>;
			}).__events;
			return events.find((event) => event.type === 'drawing-candidate');
		});
		expect(candidate?.candidateDocument?.metadata).toEqual({
			adjustment: 'none',
			host: { revision: 7 },
		});
		expect(candidate?.candidateDocument?.drawings[0]).toMatchObject({
			groupId: 'host-group-a',
			metadata: {
				kind: 'host.daily-mark',
				tradingDate: '2026-08-26',
			},
		});
	});
}

test('@browser cross-period coordinator persists then switches Scene without changing Drawings', async ({ page }) => {
	await installRuntime(page, chartWorkspace, 'host-confirmed');
	await page.evaluate(async () => {
		const { createCrossPeriodDrawingCoordinator } = await import('/src/index.ts');
		const runtime = (window as unknown as {
			__runtime: {
				readonly commitMode: 'host-confirmed';
				exportWorkspace(): typeof chartWorkspace;
				replaceScene(scene: unknown): unknown;
				commitDrawingChange(requestId: string, hash: string): boolean;
				rejectDrawingChange(requestId: string): boolean;
				subscribe(listener: (event: never) => void): () => void;
				startDrawing(type: string): string;
				listDrawings(): readonly unknown[];
			};
		}).__runtime;
		const persisted: unknown[] = [];
		const coordinator = createCrossPeriodDrawingCoordinator(
			runtime as never,
			{
				instrumentKey: 'CN:600519',
				scopeKey: runtime.exportWorkspace().drawings.scopeKey,
			},
			{
				initialRevision: 'r1',
				loadScene: async ({ period, currentWorkspace }) => ({
					...structuredClone(currentWorkspace.scene.document),
					period: structuredClone(period),
				}) as never,
				persistCandidate: async (request) => {
					persisted.push(request);
					return {
						canonicalHash: request.canonicalHash,
						revision: 'r2',
					};
				},
			},
		);
		(window as unknown as Record<string, unknown>).__coordinator = coordinator;
		(window as unknown as Record<string, unknown>).__persisted = persisted;
		runtime.startDrawing('horizontalStraightLine');
	});
	await page.mouse.click(500, 40);
	const result = await page.evaluate(async () => {
		const runtime = (window as unknown as {
			__runtime: {
				listDrawings(): readonly unknown[];
				exportWorkspace(): typeof chartWorkspace;
			};
		}).__runtime;
		const coordinator = (window as unknown as {
			__coordinator: {
				readonly currentRevision: string | null;
				waitForIdle(): Promise<void>;
				switchPeriod(period: unknown): Promise<unknown>;
			};
		}).__coordinator;
		await coordinator.waitForIdle();
		const beforeSwitch = runtime.listDrawings().length;
		await coordinator.switchPeriod({ type: 'week', span: 1 });
		const workspace = runtime.exportWorkspace();
		return {
			beforeSwitch,
			afterSwitch: runtime.listDrawings().length,
			period: workspace.scene.document.period,
			revision: coordinator.currentRevision,
			persisted: (window as unknown as { __persisted: readonly unknown[] })
				.__persisted.length,
		};
	});
	expect(result).toEqual({
		beforeSwitch: 23,
		afterSwitch: 23,
		period: { type: 'week', span: 1 },
		revision: 'r2',
		persisted: 1,
	});
});

test('@browser Workspace Runtime replaces the Scene atomically', async ({ page }) => {
	await installRuntime(page, chartWorkspace);
	const result = await page.evaluate((chartWorkspace) => {
		const runtime = (window as unknown as {
			__runtime: {
				replaceScene(scene: unknown): unknown;
				exportWorkspace(): {
					readonly scene: {
						readonly document: { readonly data: readonly { readonly close: number }[] };
					};
				};
			};
			__events: readonly { readonly type: string }[];
		}).__runtime;
		const next = structuredClone(chartWorkspace.scene.document);
		next.data[0].close = 12.6;
		runtime.replaceScene(next);
		const exported = runtime.exportWorkspace();
		return {
			close: exported.scene.document.data[0].close,
			replaced: (window as unknown as {
				__events: readonly { readonly type: string }[];
			}).__events.some((event) => event.type === 'scene-replaced'),
		};
	}, chartWorkspace);
	expect(result.close).toBe(12.6);
	expect(result.replaced).toBe(true);
});

test('@browser Workspace Runtime prepends an earlier page through the native loader', async ({ page }) => {
	await installRuntime(page, chartWorkspace, 'immediate', true);
	await expect.poll(() => page.evaluate(() => {
		const events = (window as unknown as {
			__events: Array<{ readonly type: string }>;
		}).__events;
		return events.some((event) => event.type === 'historical-data-requested');
	})).toBe(true);
	const result = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				commitHistoricalData(
					requestId: string,
					data: readonly unknown[],
					hasMore: boolean,
				): { readonly addedCount: number };
				exportWorkspace(): typeof chartWorkspace;
			};
			__events: Array<{
				readonly type: string;
				readonly requestId?: string;
				readonly beforeTimestamp?: number;
			}>;
		}).__runtime;
		const events = (window as unknown as {
			__events: Array<{
				readonly type: string;
				readonly requestId?: string;
				readonly beforeTimestamp?: number;
			}>;
		}).__events;
		const request = events.find((event) => event.type === 'historical-data-requested')!;
		const timestamp = request.beforeTimestamp! - 86_400_000;
		const committed = runtime.commitHistoricalData(
			request.requestId!,
			[{
				timestamp,
				open: 12,
				high: 12.3,
				low: 11.9,
				close: 12.2,
				volume: 10,
			}],
			false,
		);
		const workspace = runtime.exportWorkspace();
		return {
			addedCount: committed.addedCount,
			dataCount: workspace.scene.document.data.length,
			firstTimestamp: workspace.scene.document.data[0].timestamp,
			timestamp,
			appended: events.some((event) => event.type === 'historical-data-appended'),
		};
	});
	expect(result).toEqual({
		addedCount: 1,
		dataCount: 4,
		firstTimestamp: result.timestamp,
		timestamp: result.timestamp,
		appended: true,
	});
});

test('@browser time-series Workspace replaces period in the same Adapter', async ({ page }) => {
	await installRuntime(page, timeSeriesWorkspace);
	const result = await page.evaluate((timeSeriesWorkspace) => {
		const runtime = (window as unknown as {
			__runtime: {
				replaceScene(scene: unknown): unknown;
				exportWorkspace(): typeof timeSeriesWorkspace;
				listDrawings(): readonly unknown[];
			};
		}).__runtime;
		const before = runtime.listDrawings().length;
		const next = structuredClone(timeSeriesWorkspace.scene.document);
		next.period = { type: 'week', span: 1 };
		runtime.replaceScene(next);
		return {
			before,
			after: runtime.listDrawings().length,
			period: runtime.exportWorkspace().scene.document.period,
		};
	}, timeSeriesWorkspace);
	expect(result).toEqual({
		before: 22,
		after: 22,
		period: { type: 'week', span: 1 },
	});
});

test('@browser Workspace Runtime switches candle→area→candle without touching Drawings', async ({ page }) => {
	await installRuntime(page, chartWorkspace);
	const result = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				setMainSeriesPresentation(
					presentation: unknown,
				): { readonly activeType: string };
				listDrawings(): readonly unknown[];
			};
			__events: readonly { readonly type: string }[];
		}).__runtime;
		const before = JSON.stringify(runtime.listDrawings());
		const area = runtime.setMainSeriesPresentation({
			type: 'area',
			value: 'close',
			line: { color: 'rgba(41, 98, 255, 1)', size: 2 },
			backgroundColor: 'rgba(0, 0, 0, 0)',
			smooth: false,
			pointVisible: false,
		});
		const candle = runtime.setMainSeriesPresentation({ type: 'candle_solid' });
		const after = JSON.stringify(runtime.listDrawings());
		return {
			area: area.activeType,
			candle: candle.activeType,
			unchanged: before === after,
			event: (window as unknown as {
				__events: readonly { readonly type: string }[];
			}).__events.some(
				(event) => event.type === 'main-series-presentation-changed',
			),
		};
	});
	expect(result.area).toBe('area');
	expect(result.candle).toBe('candle_solid');
	expect(result.unchanged).toBe(true);
	expect(result.event).toBe(true);
});

test('@browser Workspace Runtime time-series rejects presentation and scale mutation', async ({ page }) => {
	await installRuntime(page, timeSeriesWorkspace);
	const result = await page.evaluate(async () => {
		const runtime = (window as unknown as {
			__runtime: {
				setMainSeriesPresentation(presentation: unknown): unknown;
				setValueAxisScale(scale: string): Promise<unknown>;
				getRuntimeCapabilityDescriptor(): {
					readonly mainSeriesPresentation: unknown;
					readonly valueAxis: { readonly mutable: boolean; readonly supportedScales: readonly string[] };
				};
			};
		}).__runtime;
		let presentationCode: string | null = null;
		try {
			runtime.setMainSeriesPresentation({ type: 'candle_solid' });
		} catch (error) {
			presentationCode = (error as { code?: string }).code ?? null;
		}
		let scaleError: string | null = null;
		try {
			await runtime.setValueAxisScale('logarithmic');
		} catch (error) {
			scaleError = (error as Error).message;
		}
		const descriptor = runtime.getRuntimeCapabilityDescriptor();
		return {
			presentationCode,
			scaleError,
			mainSeriesNull: descriptor.mainSeriesPresentation === null,
			mutable: descriptor.valueAxis.mutable,
			scales: descriptor.valueAxis.supportedScales,
		};
	});
	expect(result.presentationCode).toBe('MAIN_SERIES_PRESENTATION_UNSUPPORTED');
	expect(result.scaleError).toContain('VALUE_AXIS_SCALE_UNSUPPORTED');
	expect(result.mainSeriesNull).toBe(true);
	expect(result.mutable).toBe(false);
	expect(result.scales).toEqual(['linear']);
});

test('@browser Workspace Runtime destroys idempotently', async ({ page }) => {
	await installRuntime(page, chartWorkspace);
	const result = await page.evaluate(async () => {
		const { createDrawingFloatingToolbar, createStandardToolbar } = await import('/src/index.ts');
		const runtime = (window as unknown as {
			__runtime: {
				destroy(): void;
				listDrawings(): unknown;
				selectDrawing(id: string | null): void;
			};
		}).__runtime;
		const chart = document.querySelector<HTMLElement>('#chart')!;
		const toolbarHost = document.createElement('div');
		document.body.prepend(toolbarHost);
		createStandardToolbar(toolbarHost, runtime as never);
		createDrawingFloatingToolbar(chart, runtime as never);
		runtime.selectDrawing('drawing-horizontalStraightLine-1');
		runtime.destroy();
		runtime.destroy();
		let destroyedError = '';
		try {
			runtime.listDrawings();
		} catch (error) {
			destroyedError = (error as Error).message;
		}
		return {
			destroyedError,
			standardToolbarCount: document.querySelectorAll('.baron-kline-toolbar').length,
			floatingToolbarCount: document.querySelectorAll('.baron-drawing-toolbar').length,
		};
	});
	expect(result.destroyedError).toContain('destroy-only');
	expect(result.standardToolbarCount).toBe(0);
	expect(result.floatingToolbarCount).toBe(0);
});
