import type {
	ChartScene,
	Drawing,
	DrawingDocument,
	DrawableWorkspaceDocument,
	MarketData,
	SceneIndicator,
} from '@baron1996/kline-scene-schema';
import type {
	EmptyChartEnginePort,
	EmptyChartRuntimeBootstrap,
	EngineDrawingSnapshot,
	EngineHistoricalDataCommitResult,
	MainSeriesPresentation,
} from '@baron1996/klinecharts-adapter';
import {
	STANDARD_CLOSE_LINE_PRESENTATION,
	SUPPORTED_OVERLAYS,
} from '@baron1996/klinecharts-adapter';

import { runRuntimeTeardowns } from '../lifecycle.js';
import type { AddIndicatorOptions } from '../types.js';
import type { RuntimeCapabilityDescriptor } from './runtime-capability-descriptor.js';
import { getSceneRuntime } from './scene-runtime-factory.js';
import {
	deepFreeze,
	WORKSPACE_EVENT_PROTOCOL,
	WORKSPACE_EVENT_PROTOCOL_VERSION,
	type WorkspaceRuntimeEvent,
	type WorkspaceRuntimeListener,
} from './workspace-events.js';
import {
	DrawableWorkspaceRuntime,
	type DrawableWorkspaceRuntimeOptions,
} from './workspace-runtime.js';

export type ProgressiveWorkspaceRuntimeState =
	| 'empty'
	| 'loading-history'
	| 'error'
	| 'ready';

export interface EmptyDrawableWorkspaceBootstrap extends EmptyChartRuntimeBootstrap {
	/** Drawing 的业务身份；只用于首份 Scene 就绪后创建空文档，不进入空 Scene。 */
	readonly scopeKey: string;
	readonly drawingMetadata?: DrawingDocument['metadata'];
}

export interface EmptyDrawableWorkspaceRuntimeOptions
	extends DrawableWorkspaceRuntimeOptions {
	readonly emptyStateText?: string;
	readonly loadingStateText?: string;
}

export interface ProgressiveRuntimeStateCapability {
	getRuntimeState(): ProgressiveWorkspaceRuntimeState;
	subscribeRuntimeState(listener: (state: ProgressiveWorkspaceRuntimeState) => void): () => void;
}

const EMPTY_RUNTIME_STYLES = `
.baron-progressive-runtime-state {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(120, 123, 134, 1);
  font: 500 13px/1.5 system-ui, sans-serif;
  text-align: center;
  pointer-events: none;
}
.baron-progressive-runtime-state[hidden] { display: none; }
`;

/**
 * 浏览器专用渐进 Runtime。空阶段只有真实的 KLineCharts 容器和网格，
 * 不存在可序列化 Scene/Workspace，也不会构造占位行情。
 */
export class ProgressiveDrawableWorkspaceRuntime
	implements ProgressiveRuntimeStateCapability {
	readonly #container: HTMLElement;
	readonly #bootstrap: EmptyDrawableWorkspaceBootstrap;
	readonly #options: EmptyDrawableWorkspaceRuntimeOptions;
	readonly #adapter: EmptyChartEnginePort;
	readonly #listeners = new Set<WorkspaceRuntimeListener>();
	readonly #stateListeners = new Set<(state: ProgressiveWorkspaceRuntimeState) => void>();
	readonly #runtimeId = `progressive-workspace-${Math.random().toString(36).slice(2)}`;
	readonly #stateElement: HTMLDivElement;
	readonly #stateStyle: HTMLStyleElement;
	readonly #originalPosition: string;
	/** 空态和就绪态共用的当前展示时区。 */
	#displayTimezone: string;
	#inner: DrawableWorkspaceRuntime | undefined;
	#state: ProgressiveWorkspaceRuntimeState = 'empty';
	#sequence = 0;
	#destroyed = false;

	private constructor(
		container: HTMLElement,
		bootstrap: EmptyDrawableWorkspaceBootstrap,
		options: EmptyDrawableWorkspaceRuntimeOptions,
		adapter: EmptyChartEnginePort,
	) {
		this.#container = container;
		this.#bootstrap = structuredClone(bootstrap);
		this.#options = options;
		this.#adapter = adapter;
		this.#displayTimezone = options.displayTimezone ?? bootstrap.chart.timezone;
		this.#originalPosition = container.style.position;
		if (getComputedStyle(container).position === 'static') {
			container.style.position = 'relative';
		}
		this.#stateStyle = document.createElement('style');
		this.#stateStyle.dataset.baronProgressiveRuntimeStyles = '';
		this.#stateStyle.textContent = EMPTY_RUNTIME_STYLES;
		this.#stateElement = document.createElement('div');
		this.#stateElement.className = 'baron-progressive-runtime-state';
		this.#stateElement.dataset.runtimeState = 'empty';
		this.#stateElement.setAttribute('role', 'status');
		this.#stateElement.setAttribute('aria-live', 'polite');
		this.#stateElement.textContent = options.emptyStateText ?? '暂无历史 K 线';
		container.append(this.#stateStyle, this.#stateElement);
		if (options.onEvent !== undefined) {
			this.#listeners.add(options.onEvent);
		}
	}

	public static async create(
		container: HTMLElement,
		bootstrap: EmptyDrawableWorkspaceBootstrap,
		options: EmptyDrawableWorkspaceRuntimeOptions,
	): Promise<ProgressiveDrawableWorkspaceRuntime> {
		const registration = getSceneRuntime('chart');
		if (registration.createEmptyAdapter === undefined) {
			throw new Error('EMPTY_RUNTIME_UNSUPPORTED: chart Adapter has no empty Runtime factory.');
		}
		const adapter = await registration.createEmptyAdapter(container, bootstrap, {
			...(options.displayTimezone === undefined
				? {}
				: { displayTimezone: options.displayTimezone }),
			...(options.drawingInteraction === undefined
				? {}
				: { drawingInteraction: options.drawingInteraction }),
		});
		return new ProgressiveDrawableWorkspaceRuntime(
			container,
			bootstrap,
			options,
			adapter,
		);
	}

	public get commitMode(): DrawableWorkspaceRuntimeOptions['commitMode'] {
		return this.#options.commitMode;
	}

	public getRuntimeState(): ProgressiveWorkspaceRuntimeState {
		return this.#state;
	}

	public subscribeRuntimeState(
		listener: (state: ProgressiveWorkspaceRuntimeState) => void,
	): () => void {
		this.#stateListeners.add(listener);
		return () => this.#stateListeners.delete(listener);
	}

	public setLoadingState(
		state: Exclude<ProgressiveWorkspaceRuntimeState, 'ready'>,
		message?: string,
	): void {
		this.#assertAlive();
		if (this.#inner !== undefined) {
			throw new Error('EMPTY_RUNTIME_ALREADY_READY: loading state cannot replace an installed Scene.');
		}
		this.#stateElement.textContent = message ?? (
			state === 'loading-history'
				? this.#options.loadingStateText ?? '正在加载历史 K 线…'
				: state === 'error'
					? '历史 K 线加载失败，可重试'
					: this.#options.emptyStateText ?? '暂无历史 K 线'
		);
		this.#setState(state);
	}

	public installInitialScene(value: ChartScene): ChartScene {
		this.#assertAlive();
		if (this.#inner !== undefined) {
			throw new Error('EMPTY_RUNTIME_ALREADY_READY: initial Scene can only be installed once.');
		}
		const scene = this.#adapter.installInitialScene(value);
		const candlePane = scene.panes.find((pane) => pane.kind === 'candle');
		const primaryAxis = candlePane?.yAxes.find((axis) => axis.role === 'primary');
		if (candlePane === undefined || primaryAxis === undefined) {
			throw new Error('EMPTY_RUNTIME_INVALID_SCENE: candle primary axis is required.');
		}
		const drawings: DrawingDocument = {
			schema: '@baron1996/drawing-document',
			version: 1,
			scopeKey: this.#bootstrap.scopeKey,
			coordinateSystem: {
				timezone: scene.chart.timezone,
				valueAxes: [{
					paneRole: 'candle',
					yAxisRole: 'primary',
					valuePrecision: scene.symbol.pricePrecision,
				}],
			},
			drawings: [],
			metadata: structuredClone(this.#bootstrap.drawingMetadata ?? {}),
		};
		const workspace: DrawableWorkspaceDocument = {
			schema: '@baron1996/drawable-workspace',
			version: 1,
			runtime: {
				engine: 'klinecharts',
				engineVersion: '10.0.0',
				workspaceRuntimeVersion: '1.0.0',
			},
			scene: { kind: 'chart', document: structuredClone(scene) as never },
			drawings,
			binding: {
				scopeKey: drawings.scopeKey,
				timezone: drawings.coordinateSystem.timezone,
				valueAxes: structuredClone(drawings.coordinateSystem.valueAxes),
			},
			metadata: {},
		};
		this.#inner = DrawableWorkspaceRuntime.createFromEmptyAdapter(
			this.#container,
			workspace,
			this.#adapter,
			{
				commitMode: this.#options.commitMode,
				onEvent: (event) => this.#dispatch(event),
				...(this.#options.hostActions === undefined
					? {}
					: { hostActions: this.#options.hostActions }),
				...(this.#options.historicalDataLoading === undefined
					? {}
					: { historicalDataLoading: this.#options.historicalDataLoading }),
				displayTimezone: this.#displayTimezone,
				...(this.#options.drawingInteraction === undefined
					? {}
					: { drawingInteraction: this.#options.drawingInteraction }),
			},
		);
		this.#stateElement.hidden = true;
		this.#setState('ready');
		return structuredClone(scene);
	}

	public installDrawingDocument(value: unknown): DrawingDocument {
		return this.#requireReady().installDrawingDocument(value);
	}

	public replaceDrawingDocumentProjection(value: unknown): DrawingDocument {
		return this.#requireReady().replaceDrawingDocumentProjection(value);
	}

	public startDrawing(type: Drawing['type'], options?: Parameters<DrawableWorkspaceRuntime['startDrawing']>[1]): string {
		return this.#requireReady().startDrawing(type, options);
	}

	public listDrawings(): readonly EngineDrawingSnapshot[] {
		return this.#inner?.listDrawings() ?? [];
	}

	public getDrawing(id: string): EngineDrawingSnapshot | undefined {
		return this.#inner?.getDrawing(id);
	}

	public updateDrawingStyles(id: string, styles: Drawing['styles']): EngineDrawingSnapshot {
		return this.#requireReady().updateDrawingStyles(id, styles);
	}

	public updateDrawingText(id: string, text: string): EngineDrawingSnapshot {
		return this.#requireReady().updateDrawingText(id, text);
	}

	public updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot {
		return this.#requireReady().updateDrawingLocked(id, locked);
	}

	public removeDrawing(id: string): boolean {
		return this.#requireReady().removeDrawing(id);
	}

	public removeDrawings(ids: readonly string[]): boolean {
		return this.#requireReady().removeDrawings(ids);
	}

	public requestDrawingDelete(id: string): void {
		this.#requireReady().requestDrawingDelete(id);
	}

	public selectDrawing(id: string | null): void {
		this.#requireReady().selectDrawing(id);
	}

	public getSelectedDrawingId(): string | undefined {
		return this.#inner?.getSelectedDrawingId();
	}

	public hitTestDrawing(point: { readonly x: number; readonly y: number }): string | null {
		return this.#requireReady().hitTestDrawing(point);
	}

	public getDrawingMutationState(): 'ready' | 'busy' {
		return this.#inner?.getDrawingMutationState() ?? 'busy';
	}

	public subscribeDrawingChanges(listener: () => void): () => void {
		return this.#requireReady().subscribeDrawingChanges(listener);
	}

	public subscribe(listener: WorkspaceRuntimeListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	public getRuntimeCapabilityDescriptor(
		options: Parameters<DrawableWorkspaceRuntime['getRuntimeCapabilityDescriptor']>[0] = {},
	): RuntimeCapabilityDescriptor {
		if (this.#inner !== undefined) {
			return this.#inner.getRuntimeCapabilityDescriptor(options);
		}
		return {
			drawingTypes: SUPPORTED_OVERLAYS,
			valueAxis: {
				supportedScales: ['linear', 'logarithmic'],
				activeScale: this.#bootstrap.panes
					.find((pane) => pane.kind === 'candle')
					?.yAxes.find((axis) => axis.role === 'primary')?.scale ?? 'linear',
				mutable: true,
			},
			exportArtifact: {
				kind: 'drawable-workspace',
				mediaType: 'application/json',
				defaultFileName: 'drawable-workspace.json',
			},
			mainSeriesPresentation: {
				presentations: [
					{ type: 'candle_solid' },
					{ type: 'candle_stroke' },
					{ type: 'candle_up_stroke' },
					{ type: 'candle_down_stroke' },
					{ type: 'ohlc' },
					STANDARD_CLOSE_LINE_PRESENTATION,
				],
				activeType: this.#bootstrap.chart.candle.type,
				mutable: true,
			},
			hostActions: options.hostActions ?? [],
		};
	}

	public exportDrawingDocument(): DrawingDocument {
		return this.#requireReady().exportDrawingDocument();
	}

	public exportWorkspace(): DrawableWorkspaceDocument {
		return this.#requireReady().exportWorkspace();
	}

	public exportArtifact(fileName?: string): ReturnType<DrawableWorkspaceRuntime['exportArtifact']> {
		return this.#requireReady().exportArtifact(fileName);
	}

	public setValueAxisScale(scale: 'linear' | 'logarithmic'): Promise<ChartScene> {
		return this.#requireReady().setValueAxisScale(scale);
	}

	public setMainSeriesPresentation(
		presentation: MainSeriesPresentation,
	): { readonly activeType: string } {
		return this.#requireReady().setMainSeriesPresentation(presentation);
	}

	public listMainIndicators(): readonly SceneIndicator[] {
		return this.#inner?.listMainIndicators() ?? [];
	}

	public addMainIndicator(options: AddIndicatorOptions): SceneIndicator {
		return this.#requireReady().addMainIndicator(options);
	}

	public removeMainIndicator(id: string): boolean {
		return this.#requireReady().removeMainIndicator(id);
	}

	public getDisplayTimezone(): string {
		return this.#inner?.getDisplayTimezone() ?? this.#displayTimezone;
	}

	public setDisplayTimezone(timezone: string): void {
		if (this.#inner !== undefined) {
			this.#inner.setDisplayTimezone(timezone);
			return;
		}
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
		} catch {
			throw new Error(`DISPLAY_TIMEZONE_INVALID: ${timezone} is not a valid IANA timezone.`);
		}
		this.#adapter.setDisplayTimezone(timezone);
		this.#displayTimezone = timezone;
	}

	public replaceScene(
		scene: ChartScene,
		options: { readonly preserveMainIndicators?: boolean } = {},
	): ChartScene {
		return this.#requireReady().replaceScene(scene, options) as ChartScene;
	}

	public commitHistoricalData(
		requestId: string,
		data: readonly MarketData[],
		hasMore: boolean,
	): EngineHistoricalDataCommitResult {
		return this.#requireReady().commitHistoricalData(requestId, data, hasMore);
	}

	public rejectHistoricalData(requestId: string, message: string): boolean {
		return this.#requireReady().rejectHistoricalData(requestId, message);
	}

	public commitDrawingChange(requestId: string, canonicalHash: string): boolean {
		return this.#requireReady().commitDrawingChange(requestId, canonicalHash);
	}

	public rejectDrawingChange(requestId: string): boolean {
		return this.#requireReady().rejectDrawingChange(requestId);
	}

	public requestHostAction(actionId: string, drawingId?: string | null): void {
		if (this.#inner !== undefined) {
			this.#inner.requestHostAction(actionId, drawingId);
			return;
		}
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
		runRuntimeTeardowns(this);
		if (this.#inner !== undefined) {
			this.#inner.destroy();
		} else {
			this.#adapter.dispose();
		}
		this.#stateElement.remove();
		this.#stateStyle.remove();
		this.#container.style.position = this.#originalPosition;
		this.#listeners.clear();
		this.#stateListeners.clear();
	}

	#requireReady(): DrawableWorkspaceRuntime {
		this.#assertAlive();
		if (this.#inner === undefined) {
			throw new Error('EMPTY_RUNTIME_NOT_READY: install a non-empty ChartScene first.');
		}
		return this.#inner;
	}

	#assertAlive(): void {
		if (this.#destroyed) {
			throw new Error('DRAWABLE_WORKSPACE_RUNTIME_DESTROYED');
		}
	}

	#setState(state: ProgressiveWorkspaceRuntimeState): void {
		this.#state = state;
		this.#stateElement.dataset.runtimeState = state;
		for (const listener of this.#stateListeners) {
			listener(state);
		}
	}

	#dispatch(event: Parameters<WorkspaceRuntimeListener>[0]): void {
		for (const listener of this.#listeners) {
			listener(structuredClone(event));
		}
	}

	#emit(event: WorkspaceRuntimeEvent): void {
		const envelope = deepFreeze({
			protocol: WORKSPACE_EVENT_PROTOCOL,
			protocolVersion: WORKSPACE_EVENT_PROTOCOL_VERSION,
			runtimeId: this.#runtimeId,
			sequence: ++this.#sequence,
			...event,
		});
		this.#dispatch(envelope);
	}
}

export async function createEmptyDrawableWorkspaceRuntime(
	container: HTMLElement,
	bootstrap: EmptyDrawableWorkspaceBootstrap,
	options: EmptyDrawableWorkspaceRuntimeOptions,
): Promise<ProgressiveDrawableWorkspaceRuntime> {
	return ProgressiveDrawableWorkspaceRuntime.create(container, bootstrap, options);
}
