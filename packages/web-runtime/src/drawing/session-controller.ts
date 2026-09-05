import type { DrawingDocument, ValueAxis } from '@baron1996/kline-scene-schema';
import {
	hashCanonicalDrawingDocument,
} from '@baron1996/kline-scene-schema';
import type {
	DrawingEnginePort,
	EngineDrawingEvent,
	EngineDrawingSnapshot,
} from '@baron1996/klinecharts-adapter';

import {
	DrawingProjectionService,
	type ProjectionScene,
} from './projection-service.js';
import type {
	WorkspaceDrawingOperation,
	WorkspaceRuntimeEvent,
} from './workspace-events.js';
import { deepFreeze } from './workspace-events.js';

export type DrawingSessionState =
	| 'ready'
	| 'interacting'
	| 'awaiting-host-confirmation'
	| 'reprojecting'
	| 'terminal-error'
	| 'destroyed';

export type DrawingSessionErrorCode =
	| 'DRAWING_CHANGE_IN_PROGRESS'
	| 'DRAWING_CHANGE_HASH_MISMATCH'
	| 'DRAWING_CHANGE_REJECTED'
	| 'DRAWING_PROJECTION_INVALID'
	| 'DRAWABLE_WORKSPACE_RUNTIME_DESTROYED';

export class DrawingSessionError extends Error {
	public readonly code: DrawingSessionErrorCode;
	public readonly path: string;

	public constructor(code: DrawingSessionErrorCode, path: string, message: string) {
		super(message);
		this.name = 'DrawingSessionError';
		this.code = code;
		this.path = path;
	}
}

interface SessionCandidate {
	readonly requestId: string;
	readonly operation: WorkspaceDrawingOperation;
	readonly before?: EngineDrawingSnapshot;
	readonly after: EngineDrawingSnapshot;
	readonly document: DrawingDocument;
	readonly canonicalHash: string;
	/** 本次候选提交后应成为权威状态的完整 Drawing 集合。 */
	readonly confirmedAfter?: readonly EngineDrawingSnapshot[];
	/** 批量变更被宿主拒绝时需要原子恢复的完整前态。 */
	readonly rollbackDrawings?: readonly EngineDrawingSnapshot[];
}

export interface DrawingSessionControllerOptions {
	readonly runtimeId: string;
	readonly commitMode: 'immediate' | 'host-confirmed';
	readonly engine: DrawingEnginePort;
	readonly projectionService: DrawingProjectionService;
	readonly scene: ProjectionScene;
	readonly valueAxes: readonly ValueAxis[];
	readonly target: {
		readonly paneRole: string;
		readonly yAxisRole: 'primary';
	};
	readonly scopeKey: string;
	readonly timezone: string;
	readonly buildDocument: (drawings: readonly EngineDrawingSnapshot[]) => DrawingDocument;
	readonly emit: (event: WorkspaceRuntimeEvent) => void;
}

/**
 * 场景无关的 Drawing 会话状态机。
 * 所有变更都走 candidate 校验/投影/展示/确认链；进度事件永不改 confirmed。
 */
export class DrawingSessionController {
	readonly #options: DrawingSessionControllerOptions;
	/** 后续 Drawing 候选投影必须使用的当前已确认 Scene。 */
	#scene: ProjectionScene;
	#state: DrawingSessionState = 'ready';
	#confirmed: EngineDrawingSnapshot[] = [];
	#candidate: SessionCandidate | null = null;
	#selectedId: string | null = null;
	/** 尚未完成首次创建提交的 Drawing；用于把引擎侧取消恢复为 ready。 */
	#interactingDrawingId: string | null = null;
	#requestSequence = 0;
	#suppressEngineEvents = false;
	readonly #unsubscribeEngine: () => void;

	public constructor(options: DrawingSessionControllerOptions) {
		this.#options = options;
		this.#scene = structuredClone(options.scene);
		this.#unsubscribeEngine = options.engine.subscribeDrawingEvents(
			(event) => this.#handleEngineEvent(event),
		);
	}

	public get state(): DrawingSessionState {
		return this.#state;
	}

	public get confirmedDrawings(): readonly EngineDrawingSnapshot[] {
		this.#assertUsable();
		return this.#confirmed.map((drawing) => structuredClone(drawing));
	}

	public get selectedId(): string | null {
		return this.#selectedId;
	}

	/** 当前已确认的投影 Scene；仅返回深拷贝，协调层不能取得引擎对象。 */
	public get projectionScene(): ProjectionScene {
		this.#assertUsable();
		return structuredClone(this.#scene);
	}

	public restoreConfirmed(drawings: readonly EngineDrawingSnapshot[]): void {
		this.#assertUsable();
		this.#suppressEngineEvents = true;
		try {
			this.#confirmed = drawings.map((drawing) => structuredClone(drawing));
			this.#options.engine.restoreDrawings(this.#confirmed);
		} finally {
			this.#suppressEngineEvents = false;
		}
	}

	public startCreate(
		type: string,
		options?: {
			readonly text?: string;
			readonly id?: string;
			readonly groupId?: string;
			readonly styles?: EngineDrawingSnapshot['styles'];
			readonly metadata?: NonNullable<EngineDrawingSnapshot['metadata']>;
		},
	): string {
		this.#assertReady();
		this.#state = 'interacting';
		const id = options?.id ?? this.#nextGeneratedDrawingId();
		this.#interactingDrawingId = id;
		try {
			const startedId = this.#options.engine.startDrawing({
				id,
				type: type as EngineDrawingSnapshot['type'],
				...(options?.groupId === undefined ? {} : { groupId: options.groupId }),
				target: structuredClone(this.#options.target),
				styles: options?.styles ?? defaultStyles(),
				metadata: structuredClone(options?.metadata ?? {}),
				...(options?.text === undefined ? {} : { text: options.text }),
			});
			if (this.#state === 'interacting') {
				this.#interactingDrawingId = startedId;
			}
			return startedId;
		} catch (error) {
			this.#interactingDrawingId = null;
			this.#state = 'ready';
			throw error;
		}
	}

	/** 自动 ID 只跳过当前已确认 Drawing；显式 ID 仍由引擎按原契约校验。 */
	#nextGeneratedDrawingId(): string {
		let id: string;
		do {
			id = `drawing-${++this.#requestSequence}`;
		} while (this.#confirmed.some((drawing) => drawing.id === id));
		return id;
	}

	public updateDrawingStyles(
		id: string,
		styles: EngineDrawingSnapshot['styles'],
	): EngineDrawingSnapshot {
		this.#assertReady();
		return this.#options.engine.updateDrawingStyles(id, styles);
	}

	public updateDrawingText(id: string, text: string): EngineDrawingSnapshot {
		this.#assertReady();
		return this.#options.engine.updateDrawingText(id, text);
	}

	public updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot {
		this.#assertReady();
		return this.#options.engine.updateDrawingLocked(id, locked);
	}

	public removeDrawing(id: string): boolean {
		this.#assertReady();
		return this.#options.engine.removeDrawing(id);
	}

	/**
	 * 原子删除多个 Drawing：引擎只应用一次完整后态，会话只发布一个候选文档。
	 * 调用方负责决定业务上允许删除的 ID（例如工具栏会排除锁定标注）。
	 */
	public removeDrawings(ids: readonly string[]): boolean {
		this.#assertReady();
		const requestedIds = new Set(ids);
		if (requestedIds.size === 0) {
			return false;
		}
		const rollbackDrawings = this.#confirmed.map((drawing) =>
			structuredClone(drawing),
		);
		const removedDrawings = rollbackDrawings.filter((drawing) =>
			requestedIds.has(drawing.id),
		);
		if (removedDrawings.length === 0) {
			return false;
		}
		const confirmedAfter = rollbackDrawings.filter((drawing) =>
			!requestedIds.has(drawing.id),
		);
		this.#state = 'interacting';
		this.#suppressEngineEvents = true;
		try {
			this.#options.engine.restoreDrawings(confirmedAfter);
		} catch (error) {
			this.#restoreBatchAfterFailure(error, rollbackDrawings);
			return false;
		} finally {
			this.#suppressEngineEvents = false;
		}
		const representative = removedDrawings[0]!;
		void this.#onBatchDelete(
			representative,
			confirmedAfter,
			rollbackDrawings,
		);
		return true;
	}

	public selectDrawing(id: string | null): void {
		this.#assertUsable();
		this.#selectedId = id;
		this.#options.engine.selectDrawing(id);
		this.#options.emit({
			type: 'selection-changed',
			id,
		});
	}

	/**
	 * 在同一个 Adapter 内原子替换 Scene 投影上下文。
	 * 候选 Scene 先以 confirmed Drawing 全量验证，成功应用引擎后才提升为当前投影 Scene。
	 */
	public replaceProjectionScene<T>(
		scene: ProjectionScene,
		apply: () => T,
	): T {
		this.#assertReady();
		const candidate = structuredClone(scene);
		this.#options.projectionService.projectDocument({
			scene: candidate,
			drawings: this.#options.buildDocument(this.#confirmed),
		});
		this.#state = 'reprojecting';
		let mutationsDisabled = false;
		try {
			this.#options.engine.setMutationsEnabled(false);
			mutationsDisabled = true;
			const result = apply();
			this.#scene = candidate;
			return result;
		} finally {
			if (mutationsDisabled) {
				try {
					this.#options.engine.setMutationsEnabled(true);
				} catch (error) {
					this.#enterTerminalError(
						'DRAWING_PROJECTION_INVALID',
						`Failed to restore Drawing mutations after Scene replacement: ${String(error)}`,
					);
					throw new DrawingSessionError(
						'DRAWING_PROJECTION_INVALID',
						'/scene',
						'The Drawing engine could not leave the Scene replacement state.',
					);
				}
			}
			this.#state = 'ready';
		}
	}

	/** 异步版本用于轴等需要等待 Adapter 原子应用完成的 Scene 事务。 */
	public async replaceProjectionSceneAsync<T>(
		scene: ProjectionScene,
		apply: () => Promise<T>,
	): Promise<T> {
		this.#assertReady();
		const candidate = structuredClone(scene);
		this.#options.projectionService.projectDocument({
			scene: candidate,
			drawings: this.#options.buildDocument(this.#confirmed),
		});
		this.#state = 'reprojecting';
		let mutationsDisabled = false;
		try {
			this.#options.engine.setMutationsEnabled(false);
			mutationsDisabled = true;
			const result = await apply();
			this.#scene = candidate;
			return result;
		} finally {
			if (mutationsDisabled) {
				try {
					this.#options.engine.setMutationsEnabled(true);
				} catch (error) {
					this.#enterTerminalError(
						'DRAWING_PROJECTION_INVALID',
						`Failed to restore Drawing mutations after Scene replacement: ${String(error)}`,
					);
					throw new DrawingSessionError(
						'DRAWING_PROJECTION_INVALID',
						'/scene',
						'The Drawing engine could not leave the Scene replacement state.',
					);
				}
			}
			this.#state = 'ready';
		}
	}

	public commitDrawingChange(requestId: string, canonicalHash: string): boolean {
		this.#assertUsable();
		if (this.#state !== 'awaiting-host-confirmation') {
			throw new DrawingSessionError(
				'DRAWING_CHANGE_IN_PROGRESS',
				'/drawings',
				'There is no host-confirmed candidate waiting for commit.',
			);
		}
		const candidate = this.#candidate;
		if (candidate === null || candidate.requestId !== requestId) {
			throw new DrawingSessionError(
				'DRAWING_CHANGE_REJECTED',
				'/drawings',
				`Unknown drawing change request: ${requestId}.`,
			);
		}
		if (candidate.canonicalHash !== canonicalHash) {
			throw new DrawingSessionError(
				'DRAWING_CHANGE_HASH_MISMATCH',
				'/drawings',
				'Candidate canonical hash does not match the requested commit.',
			);
		}
		this.#commitCandidate(candidate);
		return true;
	}

	public rejectDrawingChange(requestId: string): boolean {
		this.#assertUsable();
		if (this.#state !== 'awaiting-host-confirmation') {
			throw new DrawingSessionError(
				'DRAWING_CHANGE_IN_PROGRESS',
				'/drawings',
				'There is no host-confirmed candidate waiting for rejection.',
			);
		}
		const candidate = this.#candidate;
		if (candidate === null || candidate.requestId !== requestId) {
			throw new DrawingSessionError(
				'DRAWING_CHANGE_REJECTED',
				'/drawings',
				`Unknown drawing change request: ${requestId}.`,
			);
		}
		try {
			if (candidate.rollbackDrawings !== undefined) {
				this.#restoreDrawingSet(candidate.rollbackDrawings);
			} else if (candidate.before !== undefined) {
				this.#options.engine.restoreDrawing(candidate.before);
			} else {
				this.#options.engine.removeDrawing(candidate.after.id);
			}
		} catch (error) {
			this.#enterTerminalError(
				'DRAWING_PROJECTION_INVALID',
				`Failed to restore the rejected candidate: ${String(error)}`,
			);
			return false;
		}
		this.#candidate = null;
		this.#state = 'ready';
		this.#options.emit({
			type: 'drawing-rejected',
			requestId,
			drawing: structuredClone(candidate.after),
			document: structuredClone(candidate.document),
			canonicalHash: candidate.canonicalHash,
		});
		return true;
	}

	public enterTerminalError(code: string, message: string): void {
		this.#enterTerminalError(code, message);
	}

	public destroy(): void {
		if (this.#state === 'destroyed') {
			return;
		}
		this.#state = 'destroyed';
		this.#candidate = null;
		this.#interactingDrawingId = null;
		this.#confirmed = [];
		this.#unsubscribeEngine();
	}

	#handleEngineEvent(event: EngineDrawingEvent): void {
		if (
			this.#suppressEngineEvents ||
			this.#state === 'destroyed' ||
			this.#state === 'terminal-error'
		) {
			return;
		}
		try {
			if (event.type === 'created' || event.type === 'updated') {
				if (event.drawing === undefined) {
					return;
				}
				if (event.type === 'created' && event.id === this.#interactingDrawingId) {
					this.#interactingDrawingId = null;
				}
				void this.#onMutation({
					operation: event.type === 'created' ? 'create' : 'update',
					...(this.#confirmed.find((drawing) => drawing.id === event.id) === undefined
						? {}
						: {
								before: this.#confirmed.find((drawing) => drawing.id === event.id)!,
							}),
					after: event.drawing,
				}).catch((error: unknown) => {
					if (this.#state === 'interacting') {
						this.#state = 'ready';
					}
					this.#options.emit({
						type: 'workspace-error',
						code: error instanceof DrawingSessionError
							? error.code
							: 'DRAWING_PROJECTION_INVALID',
						message: error instanceof Error
							? error.message
							: String(error),
					});
				});
				return;
			}
			if (event.type === 'removed') {
				if (event.id === this.#interactingDrawingId) {
					this.#interactingDrawingId = null;
					this.#candidate = null;
					this.#state = 'ready';
					if (this.#selectedId === event.id) {
						this.#selectedId = null;
						this.#options.emit({ type: 'selection-changed', id: null });
					}
					return;
				}
				const before = this.#confirmed.find((drawing) => drawing.id === event.id);
				if (before === undefined) {
					return;
				}
				void this.#onMutation({
					operation: 'delete',
					before,
					after: before,
				}).catch((error: unknown) => {
					this.#options.emit({
						type: 'workspace-error',
						code: error instanceof DrawingSessionError
							? error.code
							: 'DRAWING_PROJECTION_INVALID',
						message: error instanceof Error
							? error.message
							: String(error),
					});
				});
				return;
			}
			if (event.type === 'selected' || event.type === 'deselected') {
				this.#selectedId = event.type === 'selected' ? event.id : null;
				this.#options.emit({ type: 'selection-changed', id: this.#selectedId });
			}
		} catch (error) {
			if (error instanceof DrawingSessionError) {
				if (this.#state === 'interacting') {
					this.#state = 'ready';
					this.#interactingDrawingId = null;
				}
				this.#options.emit({
					type: 'workspace-error',
					code: error.code,
					message: error.message,
				});
			}
		}
	}

	async #onMutation(input: {
		readonly operation: WorkspaceDrawingOperation;
		readonly before?: EngineDrawingSnapshot;
		readonly after: EngineDrawingSnapshot;
	}): Promise<void> {
		if (this.#state === 'awaiting-host-confirmation') {
			throw new DrawingSessionError(
				'DRAWING_CHANGE_IN_PROGRESS',
				'/drawings',
				'A host-confirmed candidate is pending; new mutations are rejected.',
			);
		}
		if (this.#state === 'interacting' && input.operation !== 'create') {
			return;
		}
		const candidateDocument = this.#options.buildDocument(
			this.#confirmedWith(input.operation, input.before, input.after),
		);
		try {
			const projected = this.#options.projectionService.projectDocument({
				scene: this.#scene,
				drawings: candidateDocument,
			});
			if (input.after !== undefined && input.operation !== 'delete') {
				const projectedDrawing = projected.drawings.find(
					(drawing) => drawing.drawing.id === input.after.id,
				);
				if (projectedDrawing === undefined) {
					throw new DrawingSessionError(
						'DRAWING_PROJECTION_INVALID',
						`/drawings/${input.after.id}`,
						'Candidate Drawing cannot be projected on the current Scene.',
					);
				}
			}
		} catch (error) {
			if (error instanceof DrawingSessionError) {
				this.#restoreBefore(input.before, input.after);
				if (input.operation === 'create' && this.#state === 'interacting') {
					this.#state = 'ready';
				}
				this.#options.emit({
					type: 'workspace-error',
					code: error.code,
					message: error.message,
				});
			}
			return;
		}
		const canonicalHash = await hashCanonicalDrawingDocument(candidateDocument);
		const candidate: SessionCandidate = {
			requestId: `change-${++this.#requestSequence}`,
			operation: input.operation,
			...(input.before === undefined ? {} : { before: structuredClone(input.before) }),
			after: structuredClone(input.after),
			document: structuredClone(candidateDocument),
			canonicalHash,
		};
		this.#candidate = candidate;
		this.#options.emit(
			deepFreeze({
				type: 'drawing-candidate',
				requestId: candidate.requestId,
				operation: input.operation,
				...(input.before === undefined ? {} : { before: structuredClone(input.before) }),
				candidate: structuredClone(input.after),
				candidateDocument: structuredClone(candidateDocument),
				canonicalHash,
			}),
		);
		if (this.#options.commitMode === 'immediate') {
			this.#commitCandidate(candidate);
		} else {
			this.#state = 'awaiting-host-confirmation';
		}
	}

	async #onBatchDelete(
		representative: EngineDrawingSnapshot,
		confirmedAfter: readonly EngineDrawingSnapshot[],
		rollbackDrawings: readonly EngineDrawingSnapshot[],
	): Promise<void> {
		try {
			const candidateDocument = this.#options.buildDocument(confirmedAfter);
			this.#options.projectionService.projectDocument({
				scene: this.#scene,
				drawings: candidateDocument,
			});
			const canonicalHash = await hashCanonicalDrawingDocument(candidateDocument);
			const candidate: SessionCandidate = {
				requestId: `change-${++this.#requestSequence}`,
				operation: 'delete',
				before: structuredClone(representative),
				after: structuredClone(representative),
				document: structuredClone(candidateDocument),
				canonicalHash,
				confirmedAfter: confirmedAfter.map((drawing) => structuredClone(drawing)),
				rollbackDrawings: rollbackDrawings.map((drawing) => structuredClone(drawing)),
			};
			this.#candidate = candidate;
			this.#options.emit(
				deepFreeze({
					type: 'drawing-candidate',
					requestId: candidate.requestId,
					operation: 'delete',
					before: structuredClone(representative),
					candidate: structuredClone(representative),
					candidateDocument: structuredClone(candidateDocument),
					canonicalHash,
				}),
			);
			if (this.#options.commitMode === 'immediate') {
				this.#commitCandidate(candidate);
			} else {
				this.#state = 'awaiting-host-confirmation';
			}
		} catch (error) {
			this.#restoreBatchAfterFailure(error, rollbackDrawings);
		}
	}

	#confirmedWith(
		operation: WorkspaceDrawingOperation,
		before: EngineDrawingSnapshot | undefined,
		after: EngineDrawingSnapshot,
	): EngineDrawingSnapshot[] {
		if (operation === 'delete') {
			return this.#confirmed.filter((drawing) => drawing.id !== after.id);
		}
		if (before === undefined) {
			return [...this.#confirmed, structuredClone(after)];
		}
		return this.#confirmed.map((drawing) =>
			drawing.id === before.id ? structuredClone(after) : drawing,
		);
	}

	#commitCandidate(candidate: SessionCandidate): void {
		this.#confirmed = candidate.confirmedAfter === undefined
			? this.#confirmedWith(
					candidate.operation,
					candidate.before,
					candidate.after,
				)
			: candidate.confirmedAfter.map((drawing) => structuredClone(drawing));
		this.#candidate = null;
		this.#state = 'ready';
		this.#options.emit({
			type: 'drawing-committed',
			requestId: candidate.requestId,
			drawing: structuredClone(candidate.after),
			document: structuredClone(candidate.document),
			canonicalHash: candidate.canonicalHash,
		});
	}

	#restoreBefore(
		before: EngineDrawingSnapshot | undefined,
		after: EngineDrawingSnapshot,
	): void {
		try {
			if (before !== undefined) {
				this.#options.engine.restoreDrawing(before);
			} else {
				this.#options.engine.removeDrawing(after.id);
			}
		} catch (error) {
			this.#enterTerminalError(
				'DRAWING_PROJECTION_INVALID',
				`Failed to restore the rejected candidate: ${String(error)}`,
			);
		}
	}

	#restoreBatchAfterFailure(
		error: unknown,
		rollbackDrawings: readonly EngineDrawingSnapshot[],
	): void {
		try {
			this.#restoreDrawingSet(rollbackDrawings);
		} catch (restoreError) {
			this.#enterTerminalError(
				'DRAWING_PROJECTION_INVALID',
				`Failed to restore the rejected candidate: ${String(restoreError)}`,
			);
			return;
		}
		this.#state = 'ready';
		this.#options.emit({
			type: 'workspace-error',
			code: error instanceof DrawingSessionError
				? error.code
				: 'DRAWING_PROJECTION_INVALID',
			message: error instanceof Error ? error.message : String(error),
		});
	}

	#restoreDrawingSet(drawings: readonly EngineDrawingSnapshot[]): void {
		this.#suppressEngineEvents = true;
		try {
			this.#options.engine.restoreDrawings(drawings);
		} finally {
			this.#suppressEngineEvents = false;
		}
	}

	#enterTerminalError(code: string, message: string): void {
		this.#state = 'terminal-error';
		this.#candidate = null;
		this.#interactingDrawingId = null;
		this.#options.emit({ type: 'workspace-error', code, message });
	}

	#assertUsable(): void {
		if (this.#state === 'terminal-error' || this.#state === 'destroyed') {
			throw new DrawingSessionError(
				'DRAWABLE_WORKSPACE_RUNTIME_DESTROYED',
				'/',
				'The Workspace Runtime is in a destroy-only state.',
			);
		}
	}

	#assertReady(): void {
		this.#assertUsable();
		if (this.#state !== 'ready') {
			throw new DrawingSessionError(
				'DRAWING_CHANGE_IN_PROGRESS',
				'/drawings',
				'Another Drawing mutation is already in progress.',
			);
		}
	}
}

function defaultStyles(): EngineDrawingSnapshot['styles'] {
	return {
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
	};
}
