import type { Drawing, Period, SceneOverlay } from '@baron1996/kline-scene-schema';
import type { Chart, Coordinate, Point } from 'klinecharts';
export const TEXT_BOX_KEY = 'baronTextBox';
export const TEXT_PERIOD_KEY = 'baronTextPeriod';
export const TEXT_BADGE_SIZE = 32;
export type TextBox = {
	readonly end: {
		readonly timestamp: number;
		readonly value: number;
	};
	readonly width: number;
	readonly height: number;
};
export function readTextBox(metadata: SceneOverlay['metadata']): TextBox | undefined {
	const box = metadata?.[TEXT_BOX_KEY] as TextBox | undefined;
	if (box === undefined || box === null || typeof box !== 'object' || !Number.isSafeInteger(box.end?.timestamp) || !Number.isFinite(box.end?.value) || !(box.width > 0) || !(box.height > 0) || !Number.isFinite(box.width) || !Number.isFinite(box.height))
		return undefined;
	return box;
}
export function readTextPeriod(metadata: SceneOverlay['metadata']): Period | undefined {
	const period = metadata?.[TEXT_PERIOD_KEY] as Period | undefined;
	return period && Number.isInteger(period.span) && period.span > 0 && ['second', 'minute', 'hour', 'day', 'week', 'month', 'year'].includes(period.type) ? period : undefined;
}
export function textPeriodLabel(period: Period | undefined): string {
	return period === undefined ? '' : `${period.span}${({ second: 's', minute: 'm', hour: 'H', day: 'D', week: 'W', month: 'M', year: 'Y' } as const)[period.type]}`;
}
export function periodMilliseconds(period: Period): number {
	return period.span * ({ second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 } as const)[period.type]!;
}
/** Continuous chart index, including fractional positions between real time buckets. */
export function textTimeIndex(timestamp: number, timestamps: readonly number[], step: number): number {
	if (timestamps.length === 0)
		return 0;
	if (timestamp <= timestamps[0]!)
		return (timestamp - timestamps[0]!) / step;
	const last = timestamps.length - 1;
	if (timestamp >= timestamps[last]!)
		return last + (timestamp - timestamps[last]!) / step;
	let low = 0, high = last;
	while (high - low > 1) {
		const mid = (low + high) >> 1;
		if (timestamps[mid]! <= timestamp)
			low = mid;
		else
			high = mid;
	}
	return low + (timestamp - timestamps[low]!) / (timestamps[high]! - timestamps[low]!);
}
export function textIndexTime(index: number, timestamps: readonly number[], step: number): number {
	const last = timestamps.length - 1;
	if (index <= 0)
		return Math.round(timestamps[0]! + index * step);
	if (index >= last)
		return Math.round(timestamps[last]! + (index - last) * step);
	const low = Math.floor(index);
	return Math.round(timestamps[low]! + (index - low) * (timestamps[low + 1]! - timestamps[low]!));
}
export function projectTextPoint(chart: Chart, paneId: string, point: {
	timestamp: number;
	value: number;
}, absolute = false): Coordinate {
	const timestamps = chart.getDataList().map(bar => bar.timestamp);
	const step = periodMilliseconds(chart.getPeriod() as Period);
	return chart.convertToPixel({ dataIndex: textTimeIndex(point.timestamp, timestamps, step), value: point.value }, { paneId, absolute }) as Coordinate;
}
export function initialTextBox(chart: Chart, paneId: string, point: Partial<Point>, text: string, styles: SceneOverlay['styles'], period: Period): TextBox {
	const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
	if (ctx)
		ctx.font = `${styles.text.weight} ${styles.text.size}px ${styles.text.family}`;
	const width = Math.max(80, (ctx?.measureText(`${textPeriodLabel(period)} ${text}`).width ?? text.length * styles.text.size) + 16);
	const height = styles.text.size * 1.5 + 10;
	const start = chart.convertToPixel(point, { paneId, absolute: false }) as Coordinate;
	const pixel = { x: start.x + width, y: start.y + height };
	const end = chart.convertFromPixel([pixel], { paneId, absolute: false }) as Partial<Point>[];
	const originX = chart.convertToPixel({ dataIndex: point.dataIndex ?? textTimeIndex(point.timestamp!, chart.getDataList().map(b => b.timestamp), periodMilliseconds(period)) }, { paneId }) as Coordinate;
	const nextX = chart.convertToPixel({ dataIndex: (point.dataIndex ?? textTimeIndex(point.timestamp!, chart.getDataList().map(b => b.timestamp), periodMilliseconds(period))) + 1 }, { paneId }) as Coordinate;
	const timestamps = chart.getDataList().map(bar => bar.timestamp);
	const index = textTimeIndex(point.timestamp!, timestamps, periodMilliseconds(period)) + width / Math.max(1, nextX.x - originX.x);
	return { end: { timestamp: textIndexTime(index, timestamps, periodMilliseconds(period)), value: end[0]!.value! }, width, height };
}
export function textBoxLayout(start: Coordinate, end: Coordinate, box: TextBox) {
	const width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
	const collapsed = width < Math.max(44, box.width * 0.28) || height < 14;
	return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height, collapsed };
}
export function textExtendData(overlay: {
	type: string;
	metadata?: SceneOverlay['metadata'] | undefined;
	text?: string | undefined;
}, selected = false, nativeHandles = true): unknown {
	return overlay.type === 'text' ? { text: overlay.text ?? '', box: readTextBox(overlay.metadata), period: readTextPeriod(overlay.metadata), selected, nativeHandles } : overlay.text;
}
export function engineText(value: unknown): string {
	if (typeof value === 'string')
		return value;
	return value && typeof value === 'object' && 'text' in value && typeof value.text === 'string' ? value.text : '';
}
export function textMetadata(metadata: SceneOverlay['metadata'], period?: Period, box?: TextBox): NonNullable<Drawing['metadata']> {
	return { ...metadata, ...(period ? { [TEXT_PERIOD_KEY]: { ...period } } : {}), ...(box ? { [TEXT_BOX_KEY]: { ...box, end: { ...box.end } } } : {}) } as unknown as NonNullable<Drawing['metadata']>;
}
