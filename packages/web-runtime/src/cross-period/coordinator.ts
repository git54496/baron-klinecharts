import type {
	ChartScene,
	DrawableWorkspaceDocument,
	DrawingDocument,
	Period,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';
import {
	parseDrawableWorkspaceDocument,
	serializeCanonicalDrawingDocument,
} from '@baron1996/kline-scene-schema';

import type {
	WorkspaceDrawingOperation,
	WorkspaceRuntimeEventEnvelope,
	WorkspaceRuntimeListener,
} from '../drawing/workspace-events.js';
import { deepFreeze } from '../drawing/workspace-events.js';

export type CrossPeriodDrawingState =
	| 'ready'
	| 'switching-period'
	| 'persisting-drawing'
	| 'terminal-error'
	| 'destroyed';

export type CrossPeriodDrawingErrorCode =
	| 'CROSS_PERIOD_INVALID_BINDING'
	| 'CROSS_PERIOD_SCOPE_MISMATCH'
	| 'CROSS_PERIOD_RUNTIME_MODE_UNSUPPORTED'
	| 'CROSS_PERIOD_OPERATION_IN_PROGRESS'
	| 'CROSS_PERIOD_RUNTIME_DESTROYED'
	| 'CROSS_PERIOD_PERSISTENCE_FAILED'
	| 'CROSS_PERIOD_PERSISTENCE_HASH_MISMATCH'
	| 'CROSS_PERIOD_COMMIT_AFTER_PERSIST_FAILED'
	| 'CROSS_PERIOD_CANDIDATE_RESTORE_FAILED'
	| 'CROSS_PERIOD_SCENE_PERIOD_MISMATCH'
	| 'CROSS_PERIOD_SCENE_SWITCH_FAILED';

export class CrossPeriodDrawingError extends Error {
	public readonly code: CrossPeriodDrawingErrorCode;
	public readonly path: string;

	public constructor(
		code: CrossPeriodDrawingErrorCode,
		path: string,
		message: string,
	) {
		super(message);
		this.name = 'CrossPeriodDrawingError';
		this.code = code;
		this.path = path;
	}
}

export interface CrossPeriodInstrumentBinding {
	/** 宿主提供的稳定标的身份；不得由 ticker 或展示名称推断。 */
	readonly instrumentKey: string;
	/** 与 DrawingDocument.scopeKey 一对一绑定的不透明范围键。 */
	readonly scopeKey: string;
}

export type CrossPeriodRevision = string | null;

export interface CrossPeriodSceneLoadRequest {
	readonly binding: CrossPeriodInstrumentBinding;
	readonly period: Period;
	readonly currentWorkspace: DrawableWorkspaceDocument;
}

export type CrossPeriodSceneLoader = (
	request: CrossPeriodSceneLoadRequest,
) => Promise<ChartScene | TimeSeriesScene>;

export interface CrossPeriodDrawingPersistenceRequest {
	readonly binding: CrossPeriodInstrumentBinding;
	readonly requestId: string;
	readonly operation: WorkspaceDrawingOperation;
	readonly canonicalHash: string;
	readonly idempotencyKey: string;
	readonly expectedRevision: CrossPeriodRevision;
	readonly candidateDocument: DrawingDocument;
	readonly candidateWorkspace: DrawableWorkspaceDocument;
}

export interface CrossPeriodDrawingPersistenceReceipt {
	readonly canonicalHash: string;
	readonly revision: CrossPeriodRevision;
}

export type CrossPeriodDrawingPersistencePort = (
	request: CrossPeriodDrawingPersistenceRequest,
) => Promise<CrossPeriodDrawingPersistenceReceipt>;

/**
 * 跨周期层使用的最小 Workspace Runtime 端口。
 * 端口只含公共文档与事务操作，不暴露 Adapter、Chart 或投影实现。
 */
export interface CrossPeriodWorkspaceRuntimePort {
	readonly commitMode: 'immediate' | 'host-confirmed';
	exportWorkspace(): DrawableWorkspaceDocument;
	replaceScene(scene: ChartScene | TimeSeriesScene): ChartScene | TimeSeriesScene;
	commitDrawingChange(requestId: string, canonicalHash: string): boolean;
	rejectDrawingChange(requestId: string): boolean;
	subscribe(listener: WorkspaceRuntimeListener): () => void;
}

export interface CrossPeriodDrawingCoordinatorOptions {
	readonly initialRevision: CrossPeriodRevision;
	readonly loadScene: CrossPeriodSceneLoader;
	readonly persistCandidate: CrossPeriodDrawingPersistencePort;
	readonly onEvent?: CrossPeriodDrawingCoordinatorListener;
}

export type CrossPeriodDrawingCoordinatorEvent =
	| { readonly type: 'state-changed'; readonly state: CrossPeriodDrawingState }
	| {
			readonly type: 'drawing-persistence-started';
			readonly requestId: string;
			readonly canonicalHash: string;
			readonly expectedRevision: CrossPeriodRevision;
	  }
	| {
			readonly type: 'drawing-persistence-committed';
			readonly requestId: string;
			readonly canonicalHash: string;
			readonly revision: CrossPeriodRevision;
	  }
	| {
			readonly type: 'drawing-persistence-rejected';
			readonly requestId: string;
			readonly canonicalHash: string;
			readonly code: CrossPeriodDrawingErrorCode;
			readonly message: string;
	  }
	| { readonly type: 'period-switch-started'; readonly period: Period }
	| {
			readonly type: 'period-switch-completed';
			readonly period: Period;
			readonly scene: ChartScene | TimeSeriesScene;
	  }
	| {
			readonly type: 'period-switch-failed';
			readonly period: Period;
			readonly code: CrossPeriodDrawingErrorCode;
			readonly message: string;
	  }
	| {
			readonly type: 'terminal-error';
			readonly code: CrossPeriodDrawingErrorCode;
			readonly message: string;
	  }
	| { readonly type: 'destroyed' };

export type CrossPeriodDrawingCoordinatorListener = (
	event: CrossPeriodDrawingCoordinatorEvent,
) => void;

function assertBinding(binding: CrossPeriodInstrumentBinding): void {
	if (
		typeof binding.instrumentKey !== 'string' ||
		binding.instrumentKey.length === 0 ||
		binding.instrumentKey.length > 256
	) {
		throw new CrossPeriodDrawingError(
			'CROSS_PERIOD_INVALID_BINDING',
			'/instrumentKey',
			'instrumentKey must be a non-empty string with at most 256 characters.',
		);
	}
	if (
		typeof binding.scopeKey !== 'string' ||
		binding.scopeKey.length === 0 ||
		binding.scopeKey.length > 256
	) {
		throw new CrossPeriodDrawingError(
			'CROSS_PERIOD_INVALID_BINDING',
			'/scopeKey',
			'scopeKey must be a non-empty string with at most 256 characters.',
		);
	}
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
	if (left.byteLength !== right.byteLength) {
		return false;
	}
	for (let index = 0; index < left.byteLength; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function idempotencyKey(
	binding: CrossPeriodInstrumentBinding,
	canonicalHash: string,
): string {
	return [
		'cross-period-drawing',
		encodeURIComponent(binding.scopeKey),
		canonicalHash,
	].join(':');
}

/**
 * 只负责编排 scope、周期切换和宿主持久化；所有画线事实与事务仍由 Workspace Runtime 权威管理。
 */
export class CrossPeriodDrawingCoordinator {
	/** 唯一 Workspace 事务入口；不包含 Adapter 或 Chart。 */
	readonly #runtime: CrossPeriodWorkspaceRuntimePort;
	/** 宿主显式提供且全生命周期不可变的标的范围绑定。 */
	readonly #binding: CrossPeriodInstrumentBinding;
	/** 行情 Scene 加载与持久化副作用均通过宿主端口注入。 */
	readonly #options: CrossPeriodDrawingCoordinatorOptions;
	readonly #listeners = new Set<CrossPeriodDrawingCoordinatorListener>();
	/** 用于 waitForIdle 覆盖 Scene 加载和异步 Drawing 确认。 */
	readonly #pendingOperations = new Set<Promise<void>>();
	readonly #unsubscribeRuntime: () => void;
	/** 编排状态与 DrawingSessionController 状态相互独立，不取代其权威。 */
	#state: CrossPeriodDrawingState = 'ready';
	/** 最近一次成功持久化并完成 Runtime commit 后的宿主 revision。 */
	#revision: CrossPeriodRevision;

	public constructor(
		runtime: CrossPeriodWorkspaceRuntimePort,
		binding: CrossPeriodInstrumentBinding,
		options: CrossPeriodDrawingCoordinatorOptions,
	) {
		assertBinding(binding);
		if (runtime.commitMode !== 'host-confirmed') {
			throw new CrossPeriodDrawingError(
				'CROSS_PERIOD_RUNTIME_MODE_UNSUPPORTED',
				'/commitMode',
				'Cross-period persistence requires a host-confirmed Workspace Runtime.',
			);
		}
		this.#assertWorkspaceScope(runtime.exportWorkspace(), binding);
		this.#runtime = runtime;
		this.#binding = structuredClone(binding);
		this.#options = options;
		this.#revision = options.initialRevision;
		if (options.onEvent !== undefined) {
			this.#listeners.add(options.onEvent);
		}
		this.#unsubscribeRuntime = runtime.subscribe((event) =>
			this.#onWorkspaceEvent(event),
		);
	}

	public get state(): CrossPeriodDrawingState {
		return this.#state;
	}

	public get currentRevision(): CrossPeriodRevision {
		return this.#revision;
	}

	public get instrumentBinding(): CrossPeriodInstrumentBinding {
		return structuredClone(this.#binding);
	}

	public subscribe(listener: CrossPeriodDrawingCoordinatorListener): () => void {
		this.#assertUsable();
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	public switchPeriod(
		period: Period,
	): Promise<ChartScene | TimeSeriesScene> {
		this.#assertReady();
		const requestedPeriod = structuredClone(period);
		this.#setState('switching-period');
		const operation = this.#performPeriodSwitch(requestedPeriod);
		this.#track(operation.then(() => undefined, () => undefined));
		return operation;
	}

	public async waitForIdle(): Promise<void> {
		while (this.#pendingOperations.size > 0) {
			await Promise.all([...this.#pendingOperations]);
		}
	}

	public destroy(): void {
		if (this.#state === 'destroyed') {
			return;
		}
		if (this.#state === 'terminal-error') {
			this.#unsubscribeRuntime();
			this.#state = 'destroyed';
			this.#emit({ type: 'destroyed' });
			this.#listeners.clear();
			return;
		}
		if (this.#state !== 'ready' || this.#pendingOperations.size > 0) {
			throw new CrossPeriodDrawingError(
				'CROSS_PERIOD_OPERATION_IN_PROGRESS',
				'/',
				'Cross-period coordinator cannot be destroyed while an operation is pending.',
			);
		}
		this.#unsubscribeRuntime();
		this.#state = 'destroyed';
		this.#emit({ type: 'destroyed' });
		this.#listeners.clear();
	}

	async #performPeriodSwitch(
		period: Period,
	): Promise<ChartScene | TimeSeriesScene> {
		this.#emit({ type: 'period-switch-started', period: structuredClone(period) });
		try {
			const before = this.#runtime.exportWorkspace();
			this.#assertWorkspaceScope(before, this.#binding);
			const drawingBytes = serializeCanonicalDrawingDocument(before.drawings);
			const scene = await this.#options.loadScene({
				binding: structuredClone(this.#binding),
				period: structuredClone(period),
				currentWorkspace: structuredClone(before),
			});
			if (this.#state !== 'switching-period') {
				throw new CrossPeriodDrawingError(
					'CROSS_PERIOD_OPERATION_IN_PROGRESS',
					'/',
					'Period switching was interrupted by another coordinator state.',
				);
			}
			if (
				scene.period.type !== period.type ||
				scene.period.span !== period.span
			) {
				throw new CrossPeriodDrawingError(
					'CROSS_PERIOD_SCENE_PERIOD_MISMATCH',
					'/scene/period',
					'The loaded Scene period does not match the requested period.',
				);
			}
			const applied = this.#runtime.replaceScene(scene);
			const after = this.#runtime.exportWorkspace();
			this.#assertWorkspaceScope(after, this.#binding);
			if (!sameBytes(
				drawingBytes,
				serializeCanonicalDrawingDocument(after.drawings),
			)) {
				throw this.#enterTerminalError(
					'CROSS_PERIOD_SCENE_SWITCH_FAILED',
					'Period switching changed the confirmed DrawingDocument.',
				);
			}
			this.#emit({
				type: 'period-switch-completed',
				period: structuredClone(period),
				scene: structuredClone(applied),
			});
			return structuredClone(applied);
		} catch (error) {
			const normalized = error instanceof CrossPeriodDrawingError
				? error
				: new CrossPeriodDrawingError(
						'CROSS_PERIOD_SCENE_SWITCH_FAILED',
						'/scene',
						errorMessage(error),
					);
			this.#emit({
				type: 'period-switch-failed',
				period: structuredClone(period),
				code: normalized.code,
				message: normalized.message,
			});
			throw normalized;
		} finally {
			if (this.#state === 'switching-period') {
				this.#setState('ready');
			}
		}
	}

	#onWorkspaceEvent(event: WorkspaceRuntimeEventEnvelope): void {
		if (
			event.type !== 'drawing-candidate' ||
			this.#state === 'destroyed' ||
			this.#state === 'terminal-error'
		) {
			return;
		}
		if (this.#state !== 'ready') {
			const rejection = Promise.resolve().then(() => {
				this.#rejectCandidate(
					event,
					new CrossPeriodDrawingError(
						'CROSS_PERIOD_OPERATION_IN_PROGRESS',
						'/drawings',
						'A Drawing candidate was received while cross-period orchestration was busy.',
					),
				);
			});
			this.#track(rejection);
			return;
		}
		this.#setState('persisting-drawing');
		const persistence = Promise.resolve().then(() =>
			this.#persistCandidate(event),
		);
		this.#track(persistence);
	}

	async #persistCandidate(
		event: Extract<WorkspaceRuntimeEventEnvelope, { readonly type: 'drawing-candidate' }>,
	): Promise<void> {
		this.#emit({
			type: 'drawing-persistence-started',
			requestId: event.requestId,
			canonicalHash: event.canonicalHash,
			expectedRevision: this.#revision,
		});
		let receipt: CrossPeriodDrawingPersistenceReceipt;
		try {
			const candidateWorkspace = this.#candidateWorkspace(event.candidateDocument);
			receipt = await this.#options.persistCandidate({
				binding: structuredClone(this.#binding),
				requestId: event.requestId,
				operation: event.operation,
				canonicalHash: event.canonicalHash,
				idempotencyKey: idempotencyKey(
					this.#binding,
					event.canonicalHash,
				),
				expectedRevision: this.#revision,
				candidateDocument: structuredClone(event.candidateDocument),
				candidateWorkspace,
			});
		} catch (error) {
			this.#rejectCandidate(
				event,
				new CrossPeriodDrawingError(
					'CROSS_PERIOD_PERSISTENCE_FAILED',
					'/drawings',
					errorMessage(error),
				),
			);
			this.#restoreReadyAfterPersistence();
			return;
		}

		if (receipt.canonicalHash !== event.canonicalHash) {
			this.#rejectCandidate(
				event,
				new CrossPeriodDrawingError(
					'CROSS_PERIOD_PERSISTENCE_HASH_MISMATCH',
					'/drawings',
					'The persistence receipt hash does not match the Runtime candidate hash.',
				),
			);
			this.#restoreReadyAfterPersistence();
			return;
		}

		try {
			if (!this.#runtime.commitDrawingChange(event.requestId, event.canonicalHash)) {
				throw new Error('Workspace Runtime did not commit the persisted candidate.');
			}
		} catch (error) {
			this.#enterTerminalError(
				'CROSS_PERIOD_COMMIT_AFTER_PERSIST_FAILED',
				`Persistence succeeded but Runtime commit failed: ${errorMessage(error)}`,
			);
			return;
		}
		this.#revision = receipt.revision;
		this.#emit({
			type: 'drawing-persistence-committed',
			requestId: event.requestId,
			canonicalHash: event.canonicalHash,
			revision: this.#revision,
		});
		this.#restoreReadyAfterPersistence();
	}

	#candidateWorkspace(document: DrawingDocument): DrawableWorkspaceDocument {
		if (document.scopeKey !== this.#binding.scopeKey) {
			throw new CrossPeriodDrawingError(
				'CROSS_PERIOD_SCOPE_MISMATCH',
				'/drawings/scopeKey',
				'Drawing candidate scopeKey does not match the instrument binding.',
			);
		}
		const current = this.#runtime.exportWorkspace();
		this.#assertWorkspaceScope(current, this.#binding);
		return parseDrawableWorkspaceDocument({
			...structuredClone(current),
			drawings: structuredClone(document),
			binding: {
				scopeKey: document.scopeKey,
				timezone: document.coordinateSystem.timezone,
				valueAxes: structuredClone(document.coordinateSystem.valueAxes),
			},
		});
	}

	#rejectCandidate(
		event: Extract<WorkspaceRuntimeEventEnvelope, { readonly type: 'drawing-candidate' }>,
		error: CrossPeriodDrawingError,
	): void {
		try {
			if (!this.#runtime.rejectDrawingChange(event.requestId)) {
				throw new Error('Workspace Runtime could not restore the rejected candidate.');
			}
		} catch (rejectionError) {
			this.#enterTerminalError(
				'CROSS_PERIOD_CANDIDATE_RESTORE_FAILED',
				`Candidate rejection failed: ${errorMessage(rejectionError)}`,
			);
			return;
		}
		this.#emit({
			type: 'drawing-persistence-rejected',
			requestId: event.requestId,
			canonicalHash: event.canonicalHash,
			code: error.code,
			message: error.message,
		});
	}

	#restoreReadyAfterPersistence(): void {
		if (this.#state === 'persisting-drawing') {
			this.#setState('ready');
		}
	}

	#assertWorkspaceScope(
		workspace: DrawableWorkspaceDocument,
		binding: CrossPeriodInstrumentBinding,
	): void {
		if (
			workspace.drawings.scopeKey !== binding.scopeKey ||
			workspace.binding.scopeKey !== binding.scopeKey
		) {
			throw new CrossPeriodDrawingError(
				'CROSS_PERIOD_SCOPE_MISMATCH',
				'/scopeKey',
				'Workspace scopeKey does not match the explicit instrument binding.',
			);
		}
	}

	#assertReady(): void {
		this.#assertUsable();
		if (this.#state !== 'ready') {
			throw new CrossPeriodDrawingError(
				'CROSS_PERIOD_OPERATION_IN_PROGRESS',
				'/',
				`Cross-period coordinator is ${this.#state}.`,
			);
		}
	}

	#assertUsable(): void {
		if (this.#state === 'destroyed' || this.#state === 'terminal-error') {
			throw new CrossPeriodDrawingError(
				'CROSS_PERIOD_RUNTIME_DESTROYED',
				'/',
				'The cross-period coordinator is in a destroy-only state.',
			);
		}
	}

	#enterTerminalError(
		code: CrossPeriodDrawingErrorCode,
		message: string,
	): CrossPeriodDrawingError {
		const error = new CrossPeriodDrawingError(code, '/', message);
		this.#setState('terminal-error');
		this.#emit({ type: 'terminal-error', code, message });
		return error;
	}

	#setState(state: CrossPeriodDrawingState): void {
		this.#state = state;
		this.#emit({ type: 'state-changed', state });
	}

	#track(operation: Promise<void>): void {
		this.#pendingOperations.add(operation);
		void operation.finally(() => {
			this.#pendingOperations.delete(operation);
		});
	}

	#emit(event: CrossPeriodDrawingCoordinatorEvent): void {
		const snapshot = deepFreeze(structuredClone(event));
		for (const listener of this.#listeners) {
			try {
				listener(structuredClone(snapshot));
			} catch {
				// 宿主监听器不能改变编排状态或阻断其他监听器。
			}
		}
	}
}

export function createCrossPeriodDrawingCoordinator(
	runtime: CrossPeriodWorkspaceRuntimePort,
	binding: CrossPeriodInstrumentBinding,
	options: CrossPeriodDrawingCoordinatorOptions,
): CrossPeriodDrawingCoordinator {
	return new CrossPeriodDrawingCoordinator(runtime, binding, options);
}
