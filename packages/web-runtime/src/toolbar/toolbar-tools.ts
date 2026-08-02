import type { SupportedOverlayType } from '../types.js';
import type { ToolbarIconName } from './toolbar-icons.js';

export type ToolbarGroupId =
	| 'horizontal'
	| 'vertical'
	| 'trend'
	| 'analysis'
	| 'annotation'
	| 'shape'
	| 'edit'
	| 'action';

export interface ToolbarGroup {
	readonly id: ToolbarGroupId;
	readonly label: string;
}

export interface ToolbarToolPresentation {
	readonly label: string;
	readonly group: Exclude<ToolbarGroupId, 'action' | 'edit'>;
	readonly icon: ToolbarIconName;
}

export interface ToolbarActionPresentation {
	readonly action: 'delete' | 'export';
	readonly label: string;
	readonly group: 'action';
	readonly icon: ToolbarIconName;
}

/** 工具栏分组顺序，与评审通过的排列保持一致。 */
export const TOOLBAR_GROUPS = [
	{ id: 'horizontal', label: '水平线' },
	{ id: 'vertical', label: '垂直线' },
	{ id: 'trend', label: '趋势线' },
	{ id: 'analysis', label: '价格与分析' },
	{ id: 'annotation', label: '标注' },
	{ id: 'shape', label: '形状与文本' },
	{ id: 'edit', label: '坐标与样式' },
	{ id: 'action', label: '操作' },
] as const satisfies readonly ToolbarGroup[];

/** 每个已注册 Overlay 都必须具备唯一且完整的图标语义。 */
export const OVERLAY_TOOL_PRESENTATIONS: Readonly<
	Record<SupportedOverlayType, ToolbarToolPresentation>
> = {
	horizontalRayLine: {
		label: '水平射线',
		group: 'horizontal',
		icon: 'horizontalRay',
	},
	horizontalSegment: {
		label: '水平线段',
		group: 'horizontal',
		icon: 'horizontalSegment',
	},
	horizontalStraightLine: {
		label: '水平直线',
		group: 'horizontal',
		icon: 'horizontalStraight',
	},
	verticalRayLine: {
		label: '垂直射线',
		group: 'vertical',
		icon: 'verticalRay',
	},
	verticalSegment: {
		label: '垂直线段',
		group: 'vertical',
		icon: 'verticalSegment',
	},
	verticalStraightLine: {
		label: '垂直直线',
		group: 'vertical',
		icon: 'verticalStraight',
	},
	rayLine: {
		label: '射线',
		group: 'trend',
		icon: 'ray',
	},
	segment: {
		label: '线段',
		group: 'trend',
		icon: 'segment',
	},
	straightLine: {
		label: '直线',
		group: 'trend',
		icon: 'straight',
	},
	priceLine: {
		label: '价格线',
		group: 'analysis',
		icon: 'priceLine',
	},
	priceChannelLine: {
		label: '价格通道',
		group: 'analysis',
		icon: 'priceChannel',
	},
	parallelStraightLine: {
		label: '平行直线',
		group: 'analysis',
		icon: 'parallelStraight',
	},
	fibonacciLine: {
		label: '斐波那契线',
		group: 'analysis',
		icon: 'fibonacci',
	},
	priceMeasurement: {
		label: '价格量度',
		group: 'analysis',
		icon: 'measurement',
	},
	brush: {
		label: '画笔',
		group: 'annotation',
		icon: 'brush',
	},
	simpleAnnotation: {
		label: '简易标注',
		group: 'annotation',
		icon: 'pencil',
	},
	simpleTag: {
		label: '简易标签',
		group: 'annotation',
		icon: 'tag',
	},
	rectangle: {
		label: '矩形',
		group: 'shape',
		icon: 'rectangle',
	},
	arrow: {
		label: '箭头',
		group: 'shape',
		icon: 'arrow',
	},
	crossLine: {
		label: '十字线',
		group: 'shape',
		icon: 'crosshair',
	},
	callout: {
		label: '注释框',
		group: 'shape',
		icon: 'message',
	},
	text: {
		label: '文本',
		group: 'shape',
		icon: 'typography',
	},
};

export const TOOLBAR_ACTIONS = [
	{
		action: 'delete',
		label: '删除选中标注',
		group: 'action',
		icon: 'trash',
	},
	{
		action: 'export',
		label: '导出场景',
		group: 'action',
		icon: 'fileExport',
	},
] as const satisfies readonly ToolbarActionPresentation[];

export const TEXT_OVERLAY_TYPES: ReadonlySet<SupportedOverlayType> = new Set([
	'simpleAnnotation',
	'simpleTag',
	'callout',
	'text',
]);
