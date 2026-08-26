import type {
	MainSeriesPresentation,
	ActiveMainSeriesType,
} from '@baron1996/klinecharts-adapter';

export interface RuntimeValueAxisCapability {
	readonly supportedScales: readonly ('linear' | 'logarithmic')[];
	readonly activeScale: 'linear' | 'logarithmic';
	readonly mutable: boolean;
}

export interface RuntimeExportArtifactCapability {
	readonly kind: 'chart-scene' | 'drawable-workspace';
	readonly mediaType: 'application/json';
	readonly defaultFileName: string;
}

export interface MainSeriesPresentationCapability {
	readonly presentations: readonly MainSeriesPresentation[];
	readonly activeType: ActiveMainSeriesType;
	readonly mutable: boolean;
}

export interface HostActionDescriptor {
	readonly actionId: string;
	readonly label: string;
	readonly pressed?: boolean;
	readonly disabled?: boolean;
	readonly pending?: boolean;
	readonly errorMessage?: string;
}

export interface RuntimeCapabilityDescriptor {
	readonly drawingTypes: readonly string[];
	readonly valueAxis: RuntimeValueAxisCapability;
	readonly exportArtifact: RuntimeExportArtifactCapability;
	readonly mainSeriesPresentation: MainSeriesPresentationCapability | null;
	readonly hostActions: readonly HostActionDescriptor[];
}
