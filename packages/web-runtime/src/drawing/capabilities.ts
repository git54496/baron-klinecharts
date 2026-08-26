import type {
	ChartScene,
	Drawing,
} from '@baron1996/kline-scene-schema';
import type {
	EngineDrawingSnapshot,
	EnginePixelCoordinate,
	MainSeriesPresentation,
} from '@baron1996/klinecharts-adapter';
import type {
	HostActionDescriptor,
	RuntimeCapabilityDescriptor,
} from './runtime-capability-descriptor.js';
import type { WorkspaceRuntimeListener } from './workspace-events.js';

/** 公共 Drawing 能力；工具栏与所有正式交互式图表 Runtime 共用。 */
export interface DrawingRuntimeCapability {
	startDrawing(
		type: Drawing['type'],
		options?: {
			readonly text?: string;
			readonly id?: string;
			readonly groupId?: string;
			readonly styles?: Drawing['styles'];
			readonly metadata?: NonNullable<Drawing['metadata']>;
		},
	): string;
	listDrawings(): readonly EngineDrawingSnapshot[];
	getDrawing(id: string): EngineDrawingSnapshot | undefined;
	updateDrawingStyles(
		id: string,
		styles: Drawing['styles'],
	): EngineDrawingSnapshot;
	updateDrawingText(id: string, text: string): EngineDrawingSnapshot;
	removeDrawing(id: string): boolean;
	requestDrawingDelete(id: string): void;
	selectDrawing(id: string | null): void;
	getSelectedDrawingId(): string | undefined;
	hitTestDrawing(point: EnginePixelCoordinate): string | null;
}

export interface RuntimeAuxiliaryCapability {
	getRuntimeCapabilityDescriptor(options?: {
		readonly hostActions?: readonly HostActionDescriptor[];
	}): RuntimeCapabilityDescriptor;
	exportArtifact(fileName?: string): {
		readonly bytes: Uint8Array;
		readonly mediaType: 'application/json';
		readonly fileName: string;
	};
	setValueAxisScale(scale: 'linear' | 'logarithmic'): Promise<ChartScene>;
	setMainSeriesPresentation(
		presentation: MainSeriesPresentation,
	): { readonly activeType: string };
	requestHostAction(actionId: string, drawingId?: string | null): void;
}
