import { describe, expect, it } from 'vitest';

import chartWorkspaceFixture from '../../../tests/fixtures/workspaces/chart-minimal.json';
import timeSeriesWorkspaceFixture from '../../../tests/fixtures/workspaces/time-series-minimal.json';
import type {
	ChartScene,
	DrawableWorkspaceDocument,
	DrawingDocument,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';
import type { EngineDrawingSnapshot } from '@baron1996/klinecharts-adapter';
import {
	createCrossPeriodDrawingCoordinator,
	CrossPeriodDrawingError,
	type CrossPeriodWorkspaceRuntimePort,
} from '../src/cross-period/coordinator.js';
import {
	WORKSPACE_EVENT_PROTOCOL,
	WORKSPACE_EVENT_PROTOCOL_VERSION,
	type WorkspaceRuntimeEventEnvelope,
	type WorkspaceRuntimeListener,
} from '../src/drawing/workspace-events.js';

const binding = {
	instrumentKey: 'CN:600519',
	scopeKey: chartWorkspaceFixture.drawings.scopeKey,
} as const;

function candidateDocument(): DrawingDocument {
	const document = structuredClone(
		chartWorkspaceFixture.drawings,
	) as unknown as DrawingDocument;
	document.drawings.splice(document.drawings.length - 1, 1);
	return document;
}

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (error: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolveValue, rejectValue) => {
		resolve = resolveValue;
		reject = rejectValue;
	});
	return { promise, resolve, reject };
}

class FakeWorkspaceRuntime implements CrossPeriodWorkspaceRuntimePort {
	public readonly commitMode: 'immediate' | 'host-confirmed';
	public workspace = structuredClone(
		chartWorkspaceFixture,
	) as unknown as DrawableWorkspaceDocument;
	public subscribed = 0;
	public committed: Array<{ readonly requestId: string; readonly hash: string }> = [];
	public rejected: string[] = [];
	public replacements: Array<ChartScene | TimeSeriesScene> = [];
	public commitResult = true;
	public rejectResult = true;
	readonly #listeners = new Set<WorkspaceRuntimeListener>();
	readonly #candidates = new Map<string, DrawingDocument>();
	#sequence = 0;

	public constructor(
		commitMode: 'immediate' | 'host-confirmed' = 'host-confirmed',
		workspace: unknown = chartWorkspaceFixture,
	) {
		this.commitMode = commitMode;
		this.workspace = structuredClone(workspace) as DrawableWorkspaceDocument;
	}

	public exportWorkspace(): DrawableWorkspaceDocument {
		return structuredClone(this.workspace);
	}

	public replaceScene(scene: ChartScene | TimeSeriesScene): ChartScene | TimeSeriesScene {
		this.replacements.push(structuredClone(scene));
		this.workspace = {
			...structuredClone(this.workspace),
			scene: {
				kind: this.workspace.scene.kind,
				document: structuredClone(scene) as never,
			},
		};
		return structuredClone(scene);
	}

	public commitDrawingChange(requestId: string, canonicalHash: string): boolean {
		this.committed.push({ requestId, hash: canonicalHash });
		const drawings = this.#candidates.get(requestId);
		if (drawings !== undefined) {
			this.workspace = {
				...structuredClone(this.workspace),
				drawings: structuredClone(drawings),
				binding: {
					scopeKey: drawings.scopeKey,
					timezone: drawings.coordinateSystem.timezone,
					valueAxes: structuredClone(drawings.coordinateSystem.valueAxes),
				},
			};
		}
		return this.commitResult;
	}

	public rejectDrawingChange(requestId: string): boolean {
		this.rejected.push(requestId);
		return this.rejectResult;
	}

	public subscribe(listener: WorkspaceRuntimeListener): () => void {
		this.subscribed += 1;
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	public emitCandidate(
		document: DrawingDocument,
		canonicalHash = 'candidate-hash',
		requestId = 'change-1',
	): void {
		this.#candidates.set(requestId, structuredClone(document));
		const drawing = document.drawings[0] as unknown as EngineDrawingSnapshot;
		const event: WorkspaceRuntimeEventEnvelope = {
			protocol: WORKSPACE_EVENT_PROTOCOL,
			protocolVersion: WORKSPACE_EVENT_PROTOCOL_VERSION,
			runtimeId: 'runtime-test',
			sequence: ++this.#sequence,
			type: 'drawing-candidate',
			requestId,
			operation: 'update',
			candidate: structuredClone(drawing),
			candidateDocument: structuredClone(document),
			canonicalHash,
		};
		for (const listener of this.#listeners) {
			listener(structuredClone(event));
		}
	}
}

function nextChartScene(): ChartScene {
	const scene = structuredClone(
		chartWorkspaceFixture.scene.document,
	) as unknown as ChartScene;
	scene.period = { type: 'week', span: 1 };
	return scene;
}

function nextTimeSeriesScene(): TimeSeriesScene {
	const scene = structuredClone(
		timeSeriesWorkspaceFixture.scene.document,
	) as unknown as TimeSeriesScene;
	scene.period = { type: 'week', span: 1 };
	return scene;
}

describe('CrossPeriodDrawingCoordinator', () => {
	it('rejects scope mismatch before subscribing or calling host ports', () => {
		const runtime = new FakeWorkspaceRuntime();
		expect(() => createCrossPeriodDrawingCoordinator(
			runtime,
			{ instrumentKey: binding.instrumentKey, scopeKey: 'another-scope' },
			{
				initialRevision: 'r1',
				loadScene: async () => nextChartScene(),
				persistCandidate: async () => ({
					canonicalHash: 'unused',
					revision: 'r2',
				}),
			},
		)).toThrowError(expect.objectContaining({ code: 'CROSS_PERIOD_SCOPE_MISMATCH' }));
		expect(runtime.subscribed).toBe(0);
	});

	it('requires an explicit host-confirmed Workspace Runtime', () => {
		const runtime = new FakeWorkspaceRuntime('immediate');
		expect(() => createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async () => nextChartScene(),
			persistCandidate: async () => ({ canonicalHash: 'x', revision: 'r2' }),
		})).toThrowError(expect.objectContaining({
			code: 'CROSS_PERIOD_RUNTIME_MODE_UNSUPPORTED',
		}));
	});

	it('persists one candidate and commits only the exact returned hash', async () => {
		const runtime = new FakeWorkspaceRuntime();
		const requests: unknown[] = [];
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async () => nextChartScene(),
			persistCandidate: async (request) => {
				requests.push(request);
				return { canonicalHash: request.canonicalHash, revision: 'r2' };
			},
		});
		const candidate = candidateDocument();
		runtime.emitCandidate(candidate);
		await coordinator.waitForIdle();

		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			binding,
			requestId: 'change-1',
			canonicalHash: 'candidate-hash',
			idempotencyKey:
				'cross-period-drawing:fixture-instrument-000001:candidate-hash',
			expectedRevision: 'r1',
		});
		expect(runtime.committed).toEqual([
			{ requestId: 'change-1', hash: 'candidate-hash' },
		]);
		expect(runtime.rejected).toEqual([]);
		expect(coordinator.currentRevision).toBe('r2');
		expect(coordinator.state).toBe('ready');
	});

	it('rejects the candidate and keeps revision when persistence hash differs', async () => {
		const runtime = new FakeWorkspaceRuntime();
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async () => nextChartScene(),
			persistCandidate: async () => ({
				canonicalHash: 'different-hash',
				revision: 'r2',
			}),
		});
		runtime.emitCandidate(candidateDocument());
		await coordinator.waitForIdle();

		expect(runtime.committed).toEqual([]);
		expect(runtime.rejected).toEqual(['change-1']);
		expect(coordinator.currentRevision).toBe('r1');
		expect(coordinator.state).toBe('ready');
	});

	it('rejects the candidate when persistence throws', async () => {
		const runtime = new FakeWorkspaceRuntime();
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async () => nextChartScene(),
			persistCandidate: async () => {
				throw new Error('database unavailable');
			},
		});
		runtime.emitCandidate(candidateDocument());
		await coordinator.waitForIdle();
		expect(runtime.rejected).toEqual(['change-1']);
		expect(coordinator.currentRevision).toBe('r1');
	});

	it('enters a destroy-only state if Runtime commit fails after persistence', async () => {
		const runtime = new FakeWorkspaceRuntime();
		runtime.commitResult = false;
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async () => nextChartScene(),
			persistCandidate: async (request) => ({
				canonicalHash: request.canonicalHash,
				revision: 'r2',
			}),
		});
		runtime.emitCandidate(candidateDocument());
		await coordinator.waitForIdle();
		expect(coordinator.state).toBe('terminal-error');
		expect(coordinator.currentRevision).toBe('r1');
		expect(() => coordinator.switchPeriod({ type: 'week', span: 1 }))
			.toThrowError(expect.objectContaining({ code: 'CROSS_PERIOD_RUNTIME_DESTROYED' }));
		coordinator.destroy();
		coordinator.destroy();
		expect(coordinator.state).toBe('destroyed');
	});

	it('loads and replaces only the Scene while preserving Drawing bytes', async () => {
		const runtime = new FakeWorkspaceRuntime();
		const beforeDrawings = JSON.stringify(runtime.workspace.drawings);
		const requests: unknown[] = [];
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async (request) => {
				requests.push(request);
				return nextChartScene();
			},
			persistCandidate: async (request) => ({
				canonicalHash: request.canonicalHash,
				revision: 'r2',
			}),
		});

		const applied = await coordinator.switchPeriod({ type: 'week', span: 1 });
		expect(applied.period).toEqual({ type: 'week', span: 1 });
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			binding,
			period: { type: 'week', span: 1 },
		});
		expect(runtime.replacements).toHaveLength(1);
		expect(JSON.stringify(runtime.workspace.drawings)).toBe(beforeDrawings);
		expect(coordinator.state).toBe('ready');
	});

	it('uses the same orchestration for TimeSeriesScene without changing drawings', async () => {
		const runtime = new FakeWorkspaceRuntime(
			'host-confirmed',
			timeSeriesWorkspaceFixture,
		);
		const beforeDrawings = JSON.stringify(runtime.workspace.drawings);
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: null,
			loadScene: async () => nextTimeSeriesScene(),
			persistCandidate: async (request) => ({
				canonicalHash: request.canonicalHash,
				revision: 'r1',
			}),
		});
		const applied = await coordinator.switchPeriod({ type: 'week', span: 1 });
		expect('series' in applied).toBe(true);
		expect(JSON.stringify(runtime.workspace.drawings)).toBe(beforeDrawings);
	});

	it('keeps the old Workspace when Scene loading fails or returns another period', async () => {
		const runtime = new FakeWorkspaceRuntime();
		const before = JSON.stringify(runtime.workspace);
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async () => {
				throw new Error('market data unavailable');
			},
			persistCandidate: async (request) => ({
				canonicalHash: request.canonicalHash,
				revision: 'r2',
			}),
		});
		await expect(coordinator.switchPeriod({ type: 'week', span: 1 }))
			.rejects.toThrow('market data unavailable');
		expect(JSON.stringify(runtime.workspace)).toBe(before);
		expect(coordinator.state).toBe('ready');

		const mismatch = createCrossPeriodDrawingCoordinator(
			new FakeWorkspaceRuntime(),
			binding,
			{
				initialRevision: 'r1',
				loadScene: async () => structuredClone(
					chartWorkspaceFixture.scene.document,
				) as unknown as ChartScene,
				persistCandidate: async (request) => ({
					canonicalHash: request.canonicalHash,
					revision: 'r2',
				}),
			},
		);
		await expect(mismatch.switchPeriod({ type: 'week', span: 1 }))
			.rejects.toThrowError(expect.objectContaining({
				code: 'CROSS_PERIOD_SCENE_PERIOD_MISMATCH',
			}));
	});

	it('rejects period switching while a Drawing persistence is pending', async () => {
		const runtime = new FakeWorkspaceRuntime();
		const persistence = deferred<{
			readonly canonicalHash: string;
			readonly revision: string;
		}>();
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async () => nextChartScene(),
			persistCandidate: async () => persistence.promise,
		});
		runtime.emitCandidate(candidateDocument());
		expect(coordinator.state).toBe('persisting-drawing');
		expect(() => coordinator.switchPeriod({ type: 'week', span: 1 }))
			.toThrowError(CrossPeriodDrawingError);
		persistence.resolve({ canonicalHash: 'candidate-hash', revision: 'r2' });
		await coordinator.waitForIdle();
	});

	it('rejects a Drawing candidate received during period loading', async () => {
		const runtime = new FakeWorkspaceRuntime();
		const loading = deferred<ChartScene>();
		const coordinator = createCrossPeriodDrawingCoordinator(runtime, binding, {
			initialRevision: 'r1',
			loadScene: async () => loading.promise,
			persistCandidate: async (request) => ({
				canonicalHash: request.canonicalHash,
				revision: 'r2',
			}),
		});
		const switching = coordinator.switchPeriod({ type: 'week', span: 1 });
		runtime.emitCandidate(candidateDocument());
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(runtime.rejected).toEqual(['change-1']);
		loading.resolve(nextChartScene());
		await switching;
		expect(runtime.committed).toEqual([]);
	});
});
