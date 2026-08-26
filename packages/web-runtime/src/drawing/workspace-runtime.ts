import type {
	ChartScene,
	DrawableWorkspaceDocument,
	Drawing,
	DrawingDocument,
	TimeSeriesScene,
} from '@baron1996/kline-scene-schema';
import {
	parseChartScene,
	parseDrawableWorkspaceDocument,
	parseDrawingDocument,
	serializeCanonicalDrawableWorkspace,
} from '@baron1996/kline-scene-schema';
import type {
	ActiveMainSeriesType,
	DrawingEnginePort,
	EngineDrawingSnapshot,
	MainSeriesPresentation,
} from '@baron1996/klinecharts-adapter';
import {
	MainSeriesPresentationError,
	STANDARD_CLOSE_LINE_PRESENTATION,
} from '@baron1996/klinecharts-adapter';

import type {
	DrawingRuntimeCapability,
	RuntimeAuxiliaryCapability,
} from './capabilities.js';
import {
	DrawingProjectionService,
	type ProjectionScene,
} from './projection-service.js';
import type {
	HostActionDescriptor,
	RuntimeCapabilityDescriptor,
} from './runtime-capability-descriptor.js';
import { getSceneRuntime } from './scene-runtime-factory.js';
import {
	DrawingSessionController,
	DrawingSessionError,
} from './session-controller.js';
import {
	deepFreeze,
	WORKSPACE_EVENT_PROTOCOL,
	WORKSPACE_EVENT_PROTOCOL_VERSION,
	type WorkspaceRuntimeEvent,
	type WorkspaceRuntimeListener,
} from './workspace-events.js';

export interface DrawableWorkspaceRuntimeOptions {
	readonly commitMode: 'immediate' | 'host-confirmed';
	readonly onEvent?: WorkspaceRuntimeListener;
	readonly hostActions?: readonly HostActionDescriptor[];
}

export interface DrawableWorkspaceRuntimeHandle
	extends DrawingRuntimeCapability, RuntimeAuxiliaryCapability {}

function drawingToSnapshot(drawing: Drawing): EngineDrawingSnapshot {
	return {
		id: drawing.id,
		type: drawing.type,
		...(drawing.groupId === undefined ? {} : { groupId: drawing.groupId }),
		target: structuredClone(drawing.target) as EngineDrawingSnapshot['target'],
		geometry: structuredClone(drawing.geometry),
		styles: structuredClone(drawing.styles),
		...(drawing.metadata === undefined
			? {}
			: { metadata: structuredClone(drawing.metadata) }),
		locked: drawing.locked,
		visible: drawing.visible,
		zLevel: drawing.zLevel,
		mode: drawing.mode,
	};
}

function snapshotToDrawing(snapshot: EngineDrawingSnapshot): Drawing {
	return {
		id: snapshot.id,
		type: snapshot.type,
		...(snapshot.groupId === undefined ? {} : { groupId: snapshot.groupId }),
		target: structuredClone(snapshot.target),
		geometry: structuredClone(snapshot.geometry),
		styles: structuredClone(snapshot.styles),
		...(snapshot.metadata === undefined
			? {}
			: { metadata: structuredClone(snapshot.metadata) }),
		locked: snapshot.locked,
		visible: snapshot.visible,
		zLevel: snapshot.zLevel,
		mode: snapshot.mode,
	} as unknown as Drawing;
}

/**
 * 组合 Scene Adapter、Drawing 会话与公共能力的工作区 Runtime。
 * confirmed 文档唯一权威；宿主持久化只消费候选事件。
 */
export class DrawableWorkspaceRuntime implements DrawableWorkspaceRuntimeHandle {
	readonly #container: HTMLElement;
	readonly #workspace: DrawableWorkspaceDocument;
	readonly #engine: DrawingEnginePort;
	readonly #session: DrawingSessionController;
	readonly #projectionService = new DrawingProjectionService();
	readonly #registration: ReturnType<typeof getSceneRuntime>;
	readonly #runtimeId: string;
	/** 宿主确认策略在 Runtime 生命周期内不可切换。 */
	readonly #commitMode: DrawableWorkspaceRuntimeOptions['commitMode'];
	readonly #listeners = new Set<WorkspaceRuntimeListener>();
	#sequence = 0;
	#destroyed = false;
	#scene: ChartScene | TimeSeriesScene;

	private constructor(
		container: HTMLElement,
		workspace: DrawableWorkspaceDocument,
		engine: DrawingEnginePort,
		options: DrawableWorkspaceRuntimeOptions,
	) {
		this.#container = container;
		this.#workspace = workspace;
		this.#engine = engine;
		this.#commitMode = options.commitMode;
		this.#runtimeId = `drawable-workspace-${Math.random().toString(36).slice(2)}`;
		this.#scene = workspace.scene.document as unknown as
			| ChartScene
			| TimeSeriesScene;
		this.#registration = getSceneRuntime(workspace.scene.kind);
		this.#session = new DrawingSessionController({
			runtimeId: this.#runtimeId,
			commitMode: options.commitMode,
			engine,
			projectionService: this.#projectionService,
			scene: this.#projectionScene(),
			valueAxes: workspace.drawings.coordinateSystem.valueAxes,
			target: this.#registration.defaultTarget,
			scopeKey: workspace.drawings.scopeKey,
			timezone: workspace.drawings.coordinateSystem.timezone,
			buildDocument: (drawings) => this.#buildDocument(drawings),
			emit: (event) => this.#emit(event),
		});
		this.#session.restoreConfirmed(
			workspace.drawings.drawings.map((drawing) => drawingToSnapshot(drawing)),
		);
		if (options.onEvent !== undefined) {
			this.#listeners.add(options.onEvent);
		}
	}

	public static async create(
		container: HTMLElement,
		value: unknown,
		options: DrawableWorkspaceRuntimeOptions,
	): Promise<DrawableWorkspaceRuntime> {
		const workspace = parseDrawableWorkspaceDocument(value);
		const registration = getSceneRuntime(workspace.scene.kind);
		const engine = await registration.createAdapter(container, workspace);
		return new DrawableWorkspaceRuntime(container, workspace, engine, options);
	}

	/** 跨周期等宿主编排只能连接显式 host-confirmed Runtime。 */
	public get commitMode(): DrawableWorkspaceRuntimeOptions['commitMode'] {
		return this.#commitMode;
	}

	/** 只暴露公共会话状态，不暴露 Adapter 或 Chart。 */
	public getDrawingSessionState(): DrawingSessionController['state'] {
		return this.#session.state;
	}

	public startDrawing(
		type: Drawing['type'],
		options?: {
			readonly text?: string;
			readonly id?: string;
			readonly groupId?: string;
			readonly styles?: Drawing['styles'];
			readonly metadata?: NonNullable<Drawing['metadata']>;
		},
	): string {
		return this.#session.startCreate(type, options);
	}

	public listDrawings(): readonly EngineDrawingSnapshot[] {
		return this.#session.confirmedDrawings;
	}

	public getDrawing(id: string): EngineDrawingSnapshot | undefined {
		return this.#session.confirmedDrawings.find((drawing) => drawing.id === id);
	}

	public updateDrawingStyles(
		id: string,
		styles: Drawing['styles'],
	): EngineDrawingSnapshot {
		return this.#session.updateDrawingStyles(id, styles);
	}

	public updateDrawingText(id: string, text: string): EngineDrawingSnapshot {
		return this.#session.updateDrawingText(id, text);
	}

	public removeDrawing(id: string): boolean {
		return this.#session.removeDrawing(id);
	}

	public requestDrawingDelete(id: string): void {
		this.removeDrawing(id);
	}

	public selectDrawing(id: string | null): void {
		this.#session.selectDrawing(id);
	}

	public getSelectedDrawingId(): string | undefined {
		return this.#session.selectedId ?? undefined;
	}

	public hitTestDrawing(point: { readonly x: number; readonly y: number }): string | null {
		return this.#engine.hitTestDrawing(point);
	}

	public subscribe(listener: WorkspaceRuntimeListener): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	public getRuntimeCapabilityDescriptor(
		options: { readonly hostActions?: readonly HostActionDescriptor[] } = {},
	): RuntimeCapabilityDescriptor {
		this.#assertUsable();
		const kind = this.#sceneKind();
		const supportedScales = kind === 'chart'
			? (['linear', 'logarithmic'] as const)
			: (['linear'] as const);
		const activeScale = kind === 'chart'
			? this.#activeScale()
			: 'linear';
		return {
			drawingTypes: [
				'horizontalRayLine', 'horizontalSegment', 'horizontalStraightLine',
				'verticalRayLine', 'verticalSegment', 'verticalStraightLine',
				'rayLine', 'segment', 'straightLine', 'priceLine',
				'priceChannelLine', 'parallelStraightLine', 'fibonacciLine', 'brush',
				'simpleAnnotation', 'simpleTag',
				'priceMeasurement', 'rectangle', 'arrow', 'crossLine', 'callout', 'text',
			],
			valueAxis: {
				supportedScales,
				activeScale,
				mutable: kind === 'chart',
			},
			exportArtifact: {
				kind: 'drawable-workspace',
				mediaType: 'application/json',
				defaultFileName: 'drawable-workspace.json',
			},
			mainSeriesPresentation: kind === 'chart'
				? {
						presentations: [
							{ type: 'candle_solid' },
							{ type: 'candle_stroke' },
							{ type: 'candle_up_stroke' },
							{ type: 'candle_down_stroke' },
							{ type: 'ohlc' },
							STANDARD_CLOSE_LINE_PRESENTATION,
						],
						activeType: (this.#scene as ChartScene).chart.candle.type as ActiveMainSeriesType,
						mutable: true,
					}
				: null,
			hostActions: options.hostActions ?? [],
		};
	}

	public exportDrawingDocument(): DrawingDocument {
		this.#assertUsable();
		return parseDrawingDocument(
			this.#buildDocument(this.#session.confirmedDrawings),
		);
	}

	public exportWorkspace(): DrawableWorkspaceDocument {
		this.#assertUsable();
		const drawings = this.exportDrawingDocument();
		const workspace: DrawableWorkspaceDocument = {
			...structuredClone(this.#workspace),
			scene: {
				kind: this.#sceneKind(),
				document: structuredClone(this.#scene) as never,
			},
			drawings,
			binding: {
				scopeKey: drawings.scopeKey,
				timezone: drawings.coordinateSystem.timezone,
				valueAxes: drawings.coordinateSystem.valueAxes,
			},
		};
		return parseDrawableWorkspaceDocument(workspace);
	}

	public exportArtifact(
		fileName = 'drawable-workspace.json',
	): {
		readonly bytes: Uint8Array;
		readonly mediaType: 'application/json';
		readonly fileName: string;
	} {
		this.#assertUsable();
		return {
			bytes: serializeCanonicalDrawableWorkspace(this.exportWorkspace()),
			mediaType: 'application/json',
			fileName,
		};
	}

	public async setValueAxisScale(
		scale: 'linear' | 'logarithmic',
	): Promise<ChartScene> {
		this.#assertUsable();
		if (this.#sceneKind() !== 'chart') {
			throw new Error('VALUE_AXIS_SCALE_UNSUPPORTED: time-series Workspaces are linear-only.');
		}
		const scene = this.#scene as ChartScene;
		const paneIndex = scene.panes.findIndex((pane) => pane.kind === 'candle');
		const axisIndex = scene.panes[paneIndex]!.yAxes.findIndex(
			(axis) => axis.role === 'primary',
		);
		const candidate = parseChartScene({
			...structuredClone(scene),
			panes: scene.panes.map((pane, index) =>
				index === paneIndex
					? {
							...structuredClone(pane),
							yAxes: pane.yAxes.map((axis, axisIndexValue) =>
								axisIndexValue === axisIndex
									? { ...structuredClone(axis), scale }
									: axis,
							),
						}
					: pane,
			),
		});
		this.#assertSceneProjection(candidate);
		const engine = this.#engine as unknown as {
			setPriceScale(scale: 'linear' | 'logarithmic'): Promise<ChartScene>;
		};
		await this.#session.replaceProjectionSceneAsync(
			{
				kind: 'chart',
				document: candidate,
			} as unknown as ProjectionScene,
			() => engine.setPriceScale(scale),
		);
		this.#scene = candidate;
		this.#emit({ type: 'value-axis-scale-changed', scale });
		return structuredClone(candidate);
	}

	public setMainSeriesPresentation(
		presentation: MainSeriesPresentation,
	): { readonly activeType: string } {
		this.#assertUsable();
		if (this.#sceneKind() !== 'chart') {
			throw new MainSeriesPresentationError(
				'MAIN_SERIES_PRESENTATION_UNSUPPORTED',
				'/chart/candle',
				'time-series Workspaces do not support main series presentation.',
			);
		}
		const engine = this.#engine as unknown as {
			applyMainSeriesPresentation(
				presentation: MainSeriesPresentation,
			): { readonly activeType: string };
		};
		const result = engine.applyMainSeriesPresentation(presentation);
		this.#scene = (this.#engine as unknown as {
			exportScene(): ChartScene;
		}).exportScene();
		this.#emit({
			type: 'main-series-presentation-changed',
			activeType: result.activeType as ActiveMainSeriesType,
		});
		return result;
	}

	public replaceScene(
		scene: ChartScene | TimeSeriesScene,
	): ChartScene | TimeSeriesScene {
		this.#assertUsable();
		const candidate = this.#registration.parseScene(scene);
		if (
			(this.#sceneKind() === 'chart' && !('panes' in candidate)) ||
			(this.#sceneKind() === 'time-series' && !('series' in candidate))
		) {
			throw new Error('DRAWABLE_SCENE_KIND_UNSUPPORTED: cross-kind replacement is rejected.');
		}
		const engine = this.#engine as unknown as {
			replaceScene(value: ChartScene | TimeSeriesScene): ChartScene | TimeSeriesScene;
		};
		const applied = this.#session.replaceProjectionScene(
			{
				kind: this.#sceneKind(),
				document: candidate,
			} as unknown as ProjectionScene,
			() => engine.replaceScene(candidate),
		);
		this.#scene = applied;
		this.#emit({ type: 'scene-replaced', scene: { kind: this.#sceneKind(), document: applied } });
		return structuredClone(applied);
	}

	public commitDrawingChange(requestId: string, canonicalHash: string): boolean {
		return this.#session.commitDrawingChange(requestId, canonicalHash);
	}

	public rejectDrawingChange(requestId: string): boolean {
		return this.#session.rejectDrawingChange(requestId);
	}

	public requestHostAction(
		actionId: string,
		drawingId?: string | null,
	): void {
		this.#emit({
			type: 'host-action-requested',
			actionId,
			drawingId: drawingId ?? null,
		});
	}

	public destroy(): void {
		if (this.#destroyed) {
			return;
		}
		this.#destroyed = true;
		this.#session.destroy();
		this.#engine.dispose();
		this.#listeners.clear();
		this.#emit({ type: 'destroyed' });
	}

	#buildDocument(
		drawings: readonly EngineDrawingSnapshot[],
	): DrawingDocument {
		const workspace = this.#workspace;
		return parseDrawingDocument({
			schema: '@baron1996/drawing-document',
			version: 1,
			scopeKey: workspace.drawings.scopeKey,
			coordinateSystem: structuredClone(workspace.drawings.coordinateSystem),
			drawings: drawings.map((snapshot) => snapshotToDrawing(snapshot)),
			metadata: structuredClone(workspace.drawings.metadata),
		});
	}

	#projectionScene(): ProjectionScene {
		return {
			kind: this.#sceneKind(),
			document: this.#scene,
		} as unknown as ProjectionScene;
	}

	#assertSceneProjection(
		scene: ChartScene | TimeSeriesScene,
	): void {
		this.#projectionService.projectDocument({
			scene: {
				kind: this.#sceneKind(),
				document: scene,
			} as unknown as ProjectionScene,
			drawings: this.exportDrawingDocument(),
		});
	}

	#activeScale(): 'linear' | 'logarithmic' {
		const scene = this.#scene as ChartScene;
		return scene.panes
			.find((pane) => pane.kind === 'candle')
			?.yAxes.find((axis) => axis.role === 'primary')?.scale ?? 'linear';
	}

	#sceneKind(): 'chart' | 'time-series' {
		return 'panes' in this.#scene ? 'chart' : 'time-series';
	}

	#emit(event: WorkspaceRuntimeEvent): void {
		const envelope = deepFreeze({
			protocol: WORKSPACE_EVENT_PROTOCOL,
			protocolVersion: WORKSPACE_EVENT_PROTOCOL_VERSION,
			runtimeId: this.#runtimeId,
			sequence: ++this.#sequence,
			...event,
		});
		for (const listener of this.#listeners) {
			try {
				listener(structuredClone(envelope));
			} catch {
				// 单个监听器抛错不改变状态、不阻断其他监听器。
			}
		}
	}

	#assertUsable(): void {
		if (this.#destroyed || this.#session.state === 'terminal-error') {
			throw new DrawingSessionError(
				'DRAWABLE_WORKSPACE_RUNTIME_DESTROYED',
				'/',
				'The Workspace Runtime is in a destroy-only state.',
			);
		}
	}
}

export async function createDrawableWorkspaceRuntime(
	container: HTMLElement,
	workspace: unknown,
	options: DrawableWorkspaceRuntimeOptions,
): Promise<DrawableWorkspaceRuntime> {
	return DrawableWorkspaceRuntime.create(container, workspace, options);
}
