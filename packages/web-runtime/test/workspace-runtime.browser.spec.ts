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
): Promise<void> {
	await page.goto('/test/fixture.html');
	await page.evaluate(
		async ({ workspace, commitMode }) => {
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
			});
			(window as unknown as Record<string, unknown>).__runtime = runtime;
			(window as unknown as Record<string, unknown>).__events = events;
		},
		{ workspace, commitMode },
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
	const result = await page.evaluate(() => {
		const runtime = (window as unknown as {
			__runtime: {
				destroy(): void;
				listDrawings(): unknown;
			};
		}).__runtime;
		runtime.destroy();
		runtime.destroy();
		let destroyedError = '';
		try {
			runtime.listDrawings();
		} catch (error) {
			destroyedError = (error as Error).message;
		}
		return destroyedError;
	});
	expect(result).toContain('destroy-only');
});
