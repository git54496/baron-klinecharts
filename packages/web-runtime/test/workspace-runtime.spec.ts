import { describe, expect, it } from 'vitest';

import chartWorkspaceFixture from '../../../tests/fixtures/workspaces/chart-minimal.json';
import timeSeriesWorkspaceFixture from '../../../tests/fixtures/workspaces/time-series-minimal.json';
import type {
	ChartScene,
	DrawableWorkspaceDocument,
	Drawing,
	MarketData,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';
import type {
	DrawingEnginePort,
	EngineDrawingEvent,
	EngineDrawingSnapshot,
	EngineDrawingStartRequest,
	EngineHistoricalDataRequest,
} from '@baron1996/klinecharts-adapter';
import { DrawingProjectionService } from '../src/drawing/projection-service.js';
import { getSceneRuntime, registerSceneRuntime } from '../src/drawing/scene-runtime-factory.js';
import { createDrawableWorkspaceRuntime } from '../src/drawing/workspace-runtime.js';
import type { WorkspaceRuntimeEvent } from '../src/drawing/workspace-events.js';

class MockEngine implements DrawingEnginePort {
	public readonly sceneKind = 'chart' as const;
	public drawings = new Map<string, EngineDrawingSnapshot>();
	public listener: ((event: EngineDrawingEvent) => void) | null = null;
	public scene: ChartScene = structuredClone(
		chartWorkspaceFixture.scene.document,
	) as unknown as ChartScene;
	public appliedPresentation: string | null = null;
	public appliedScale: string | null = null;
	public replacedScene: unknown = null;
	public historicalListener: ((request: EngineHistoricalDataRequest) => void) | null = null;

	public restoreDrawings(drawings: readonly EngineDrawingSnapshot[]): void {
		this.drawings = new Map(drawings.map((drawing) => [drawing.id, drawing]));
	}

	public startDrawing(request: EngineDrawingStartRequest): string {
		this.drawings.set(request.id, {
			id: request.id,
			type: request.type,
			target: request.target,
			geometry: { value: 12.55 } as never,
			styles: request.styles,
			locked: false,
			visible: true,
			zLevel: 0,
			mode: 'normal',
		});
		return request.id;
	}

	public listDrawings(): readonly EngineDrawingSnapshot[] {
		return [...this.drawings.values()];
	}

	public getDrawing(id: string): EngineDrawingSnapshot | undefined {
		return this.drawings.get(id);
	}

	public updateDrawingStyles(id: string, styles: Drawing['styles']): EngineDrawingSnapshot {
		const before = this.drawings.get(id)!;
		const after = { ...structuredClone(before), styles: structuredClone(styles) };
		this.drawings.set(id, after);
		this.listener?.({ type: 'updated', id, drawing: after });
		return after;
	}

	public updateDrawingText(id: string, text: string): EngineDrawingSnapshot {
		const before = this.drawings.get(id)!;
		const after = structuredClone(before);
		this.drawings.set(id, after);
		this.listener?.({ type: 'updated', id, drawing: after });
		return after;
	}

	public updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot {
		const before = this.drawings.get(id)!;
		const after = { ...structuredClone(before), locked };
		this.drawings.set(id, after);
		this.listener?.({ type: 'updated', id, drawing: after });
		return after;
	}

	public restoreDrawing(snapshot: EngineDrawingSnapshot): void {
		this.drawings.set(snapshot.id, structuredClone(snapshot));
	}

	public removeDrawing(id: string): boolean {
		const removed = this.drawings.delete(id);
		if (removed) {
			this.listener?.({ type: 'removed', id });
		}
		return removed;
	}

	public selectDrawing(id: string | null): void {
		this.listener?.({
			type: id === null ? 'deselected' : 'selected',
			id: id ?? 'none',
		});
	}

	public hitTestDrawing(): string | null {
		return null;
	}

	public projectToPixel(): { readonly x: number; readonly y: number } {
		return { x: 0, y: 0 };
	}

	public unprojectFromPixel(): Record<string, never> {
		return {};
	}

	public setMutationsEnabled(): void {}

	public subscribeDrawingEvents(
		listener: (event: EngineDrawingEvent) => void,
	): () => void {
		this.listener = listener;
		return () => {
			this.listener = null;
		};
	}

	public dispose(): void {
		this.listener = null;
	}

	public async setPriceScale(scale: string): Promise<ChartScene> {
		this.appliedScale = scale;
		return structuredClone(this.scene);
	}

	public applyMainSeriesPresentation(
		presentation: { readonly type: string },
	): { readonly activeType: string } {
		this.appliedPresentation = presentation.type;
		return { activeType: presentation.type };
	}

	public exportScene(): ChartScene {
		return structuredClone(this.scene);
	}

	public replaceScene(scene: ChartScene | TimeSeriesScene): ChartScene | TimeSeriesScene {
		this.replacedScene = scene;
		this.scene = structuredClone(scene) as unknown as ChartScene;
		return structuredClone(scene);
	}

	public configureHistoricalDataLoading(): void {}

	public subscribeHistoricalDataRequests(
		listener: (request: EngineHistoricalDataRequest) => void,
	): () => void {
		this.historicalListener = listener;
		return () => {
			this.historicalListener = null;
		};
	}

	public commitHistoricalData(
		requestId: string,
		data: readonly MarketData[],
		hasMore: boolean,
	): { readonly scene: ChartScene; readonly addedCount: number; readonly hasMore: boolean } {
		this.scene = {
			...structuredClone(this.scene),
			data: [...structuredClone(data), ...structuredClone(this.scene.data)],
		} as ChartScene;
		return {
			scene: structuredClone(this.scene),
			addedCount: data.length,
			hasMore,
		};
	}

	public rejectHistoricalData(): boolean {
		return true;
	}

	public emitHistoricalRequest(request: EngineHistoricalDataRequest): void {
		this.historicalListener?.(request);
	}

	public emitCreated(id: string): void {
		this.drawings.set(id, {
			id,
			type: 'horizontalStraightLine',
			target: { paneRole: 'candle', yAxisRole: 'primary' },
			geometry: { value: 12.55 },
			styles: {
				line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
				fill: { color: 'rgba(41, 98, 255, 0.15)' },
				text: {
					color: 'rgba(255, 255, 255, 1)',
					size: 12,
					family: 'Baron Sans',
					weight: 'normal',
					backgroundColor: 'rgba(41, 98, 255, 1)',
					borderColor: 'rgba(41, 98, 255, 1)',
				},
			},
			locked: false,
			visible: true,
			zLevel: 0,
			mode: 'normal',
		});
		this.listener?.({
			type: 'created',
			id,
			drawing: this.drawings.get(id)!,
		});
	}
}

let mockEngine: MockEngine | null = null;
let timeSeriesMockEngine: MockEngine | null = null;

registerSceneRuntime({
	sceneKind: 'chart',
	parseScene: (value) => JSON.parse(JSON.stringify(value)) as never,
	createAdapter: async () => {
		mockEngine = new MockEngine();
		return mockEngine;
	},
	createPolicy: () => new (class {})() as never,
	defaultTarget: { paneRole: 'candle', yAxisRole: 'primary' },
});

registerSceneRuntime({
	sceneKind: 'time-series',
	parseScene: (value) => JSON.parse(JSON.stringify(value)) as never,
	createAdapter: async () => {
		timeSeriesMockEngine = new MockEngine();
		timeSeriesMockEngine.scene = structuredClone(
			timeSeriesWorkspaceFixture.scene.document,
		) as unknown as ChartScene;
		return timeSeriesMockEngine;
	},
	createPolicy: () => new (class {})() as never,
	defaultTarget: { paneRole: 'time-series', yAxisRole: 'primary' },
});

async function makeRuntime(
	workspace: unknown,
	commitMode: 'immediate' | 'host-confirmed' = 'immediate',
	historicalDataLoading = false,
): Promise<{
	readonly runtime: Awaited<ReturnType<typeof createDrawableWorkspaceRuntime>>;
	readonly events: WorkspaceRuntimeEvent[];
}> {
	const events: WorkspaceRuntimeEvent[] = [];
	const container = {} as HTMLElement;
	const runtime = await createDrawableWorkspaceRuntime(container, workspace, {
		commitMode,
		onEvent: (event) => events.push(event),
		...(historicalDataLoading
			? { historicalDataLoading: { hasMore: true } }
			: {}),
	});
	return { runtime, events };
}

/** 轮询等待指定类型事件；candidate 依赖异步 digest，不能只用单次宏任务。 */
async function waitForEvent(
	events: readonly WorkspaceRuntimeEvent[],
	type: WorkspaceRuntimeEvent['type'],
): Promise<WorkspaceRuntimeEvent | undefined> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const event = events.find((candidate) => candidate.type === type);
		if (event !== undefined) {
			return event;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
	}
	return undefined;
}

async function waitForDrawing(
	runtime: { listDrawings(): readonly { readonly id: string }[] },
	id: string,
): Promise<boolean> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (runtime.listDrawings().some((drawing) => drawing.id === id)) {
			return true;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
	}
	return false;
}

describe('DrawableWorkspaceRuntime', () => {
	it('restores confirmed drawings and exports a canonical Workspace', async () => {
		const { runtime } = await makeRuntime(chartWorkspaceFixture);
		expect(runtime.listDrawings()).toHaveLength(22);
		const workspace = runtime.exportWorkspace();
		expect(workspace.scene.kind).toBe('chart');
		expect(workspace.drawings.drawings).toHaveLength(22);
		const artifact = runtime.exportArtifact();
		expect(artifact.mediaType).toBe('application/json');
		expect(new TextDecoder().decode(artifact.bytes)).toContain(
			'"schema":"@baron1996/drawable-workspace"',
		);
	});

	it('host-confirmed mode emits candidate and commits only on exact hash', async () => {
		const { runtime, events } = await makeRuntime(
			chartWorkspaceFixture,
			'host-confirmed',
		);
		mockEngine!.emitCreated('drawing-new');
		const candidate = await waitForEvent(events, 'drawing-candidate');
		expect(candidate?.type).toBe('drawing-candidate');
		if (candidate?.type !== 'drawing-candidate') {
			return;
		}
		expect(runtime.listDrawings()).toHaveLength(22);
		expect(() =>
			runtime.commitDrawingChange(candidate.requestId, 'bad-hash'),
		).toThrow();
		expect(runtime.commitDrawingChange(candidate.requestId, candidate.canonicalHash))
			.toBe(true);
		expect(runtime.listDrawings()).toHaveLength(23);
	});

	it('preserves opaque document and Drawing metadata in a candidate', async () => {
		const workspace = structuredClone(chartWorkspaceFixture) as unknown as {
			drawings: {
				metadata: Record<string, unknown>;
				drawings: Array<Record<string, unknown>>;
			};
		};
		workspace.drawings.metadata = {
			adjustment: 'none',
			host: { revision: 7 },
		};
		workspace.drawings.drawings[0]!.groupId = 'host-group-a';
		workspace.drawings.drawings[0]!.metadata = {
			kind: 'host.daily-mark',
			tradingDate: '2026-08-26',
		};
		const { runtime, events } = await makeRuntime(workspace, 'host-confirmed');

		mockEngine!.emitCreated('drawing-new');
		const candidate = await waitForEvent(events, 'drawing-candidate');
		expect(candidate?.type).toBe('drawing-candidate');
		if (candidate?.type !== 'drawing-candidate') {
			return;
		}
		expect(candidate.candidateDocument.metadata).toEqual({
			adjustment: 'none',
			host: { revision: 7 },
		});
		expect(candidate.candidateDocument.drawings[0]).toMatchObject({
			groupId: 'host-group-a',
			metadata: {
				kind: 'host.daily-mark',
				tradingDate: '2026-08-26',
			},
		});
		expect(candidate.candidateDocument.drawings.at(-1)?.metadata).toBeUndefined();

		expect(runtime.commitDrawingChange(
			candidate.requestId,
			candidate.canonicalHash,
		)).toBe(true);
		expect(runtime.exportDrawingDocument().metadata).toEqual(
			workspace.drawings.metadata,
		);
	});

	it('replaces the Scene in place and emits scene-replaced', async () => {
		const { runtime, events } = await makeRuntime(chartWorkspaceFixture);
		const next = structuredClone(chartWorkspaceFixture.scene.document);
		next.data[0].close = 12.6;
		runtime.replaceScene(next as never);
		expect(mockEngine!.replacedScene).not.toBeNull();
		expect(events.some((event) => event.type === 'scene-replaced')).toBe(true);
		const exported = runtime.exportWorkspace();
		expect(
			(exported.scene as { document: ChartScene }).document.data[0].close,
		).toBe(12.6);
		expect(runtime.getDrawingSessionState()).toBe('ready');
	});

	it('forwards historical requests and atomically prepends confirmed data', async () => {
		const { runtime, events } = await makeRuntime(
			chartWorkspaceFixture,
			'immediate',
			true,
		);
		const firstTimestamp = mockEngine!.scene.data[0]!.timestamp;
		mockEngine!.emitHistoricalRequest({
			requestId: 'historical-data-1',
			beforeTimestamp: firstTimestamp,
			period: structuredClone(mockEngine!.scene.period),
			dataCount: mockEngine!.scene.data.length,
		});
		expect(events.at(-1)).toMatchObject({
			type: 'historical-data-requested',
			requestId: 'historical-data-1',
			beforeTimestamp: firstTimestamp,
		});

		const result = runtime.commitHistoricalData(
			'historical-data-1',
			[{
				timestamp: firstTimestamp - 86_400_000,
				open: 12,
				high: 12.3,
				low: 11.9,
				close: 12.2,
				volume: 10,
			}],
			false,
		);
		expect(result.addedCount).toBe(1);
		expect(result.scene.data[0]!.timestamp).toBe(firstTimestamp - 86_400_000);
		expect(runtime.exportWorkspace().scene.document.data).toHaveLength(4);
		expect(events.at(-1)).toMatchObject({
			type: 'historical-data-appended',
			addedCount: 1,
			totalCount: 4,
			hasMore: false,
		});
	});

	it('exposes host-confirmed mode for cross-period orchestration', async () => {
		const { runtime } = await makeRuntime(
			chartWorkspaceFixture,
			'host-confirmed',
		);
		expect(runtime.commitMode).toBe('host-confirmed');
	});

	it('rejects scale mutation and main series presentation on time-series', async () => {
		const { runtime } = await makeRuntime(timeSeriesWorkspaceFixture);
		await expect(runtime.setValueAxisScale('logarithmic'))
			.rejects.toThrow('VALUE_AXIS_SCALE_UNSUPPORTED');
		expect(() => runtime.setMainSeriesPresentation({ type: 'candle_solid' }))
			.toThrowError(
				expect.objectContaining({ code: 'MAIN_SERIES_PRESENTATION_UNSUPPORTED' }),
			);
		const descriptor = runtime.getRuntimeCapabilityDescriptor();
		expect(descriptor.mainSeriesPresentation).toBeNull();
		expect(descriptor.valueAxis.mutable).toBe(false);
		expect(descriptor.valueAxis.supportedScales).toEqual(['linear']);
	});

	it('isolates listener errors and destroys idempotently', async () => {
		const events: WorkspaceRuntimeEvent[] = [];
		const container = {} as HTMLElement;
		const runtime = await createDrawableWorkspaceRuntime(
			container,
			chartWorkspaceFixture,
			{ commitMode: 'immediate', onEvent: () => events.push },
		);
		runtime.subscribe(() => {
			throw new Error('listener failure');
		});
		mockEngine!.emitCreated('drawing-x');
		expect(await waitForDrawing(runtime, 'drawing-x')).toBe(true);
		runtime.destroy();
		runtime.destroy();
		expect(() => runtime.listDrawings()).toThrow();
	});

	it('applies main series presentation on chart and emits the new protocol event', async () => {
		const { runtime, events } = await makeRuntime(chartWorkspaceFixture);
		const result = runtime.setMainSeriesPresentation({
			type: 'area',
			value: 'close',
			line: { color: 'rgba(41, 98, 255, 1)', size: 2 },
			backgroundColor: 'rgba(0, 0, 0, 0)',
			smooth: false,
			pointVisible: false,
		});
		expect(result.activeType).toBe('area');
		expect(mockEngine!.appliedPresentation).toBe('area');
		expect(
			events.some((event) => event.type === 'main-series-presentation-changed'),
		).toBe(true);
	});
});
