import type { ChartScene } from './generated/chart-scene.js';
import type { Drawing } from './generated/drawing-document.js';

/** Opt-in metadata: unmarked (including all legacy/day-origin) Drawings keep their old path. */
export const WEEKLY_PROJECTION_KEY = 'baron.weeklyProjection.v1';
export const HISTORY_COVERAGE_KEY = 'baron.historyCoverage.v1';

export interface CompleteHistoryWindow {
	readonly startTimestamp: number;
	readonly endTimestamp: number;
	/** Stable identity of the target-period bar timeline, shared by all confirmed pages. */
	readonly dataVersion: string;
}

export interface HistoryCoverageUpdate extends CompleteHistoryWindow {
	readonly status: 'complete' | 'incomplete' | 'empty';
}

function completeHistoryWindows(scene: ChartScene): CompleteHistoryWindow[] {
	const value = scene.metadata?.[HISTORY_COVERAGE_KEY];
	if (!Array.isArray(value)) return [];
	const windows: CompleteHistoryWindow[] = [];
	for (const item of value) {
		if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
		const start = item['startTimestamp'];
		const end = item['endTimestamp'];
		const dataVersion = item['dataVersion'];
		if (typeof start === 'number' && typeof end === 'number' &&
			Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end &&
			typeof dataVersion === 'string' && dataVersion.length > 0) {
			windows.push({ startTimestamp: start, endTimestamp: end, dataVersion });
		}
	}
	return windows;
}

/** A complete response proves its requested time interval, including days with no session. */
export function recordCompleteHistoryWindow(scene: ChartScene, window: CompleteHistoryWindow): ChartScene {
	if (!Number.isSafeInteger(window.startTimestamp) || !Number.isSafeInteger(window.endTimestamp) ||
		window.startTimestamp > window.endTimestamp || typeof window.dataVersion !== 'string' ||
		window.dataVersion.length === 0) return scene;
	// Pages from different revisions cannot jointly prove one bar-index timeline.
	const sorted = [...completeHistoryWindows(scene).filter((item) => item.dataVersion === window.dataVersion), window]
		.sort((left, right) => left.startTimestamp - right.startTimestamp);
	const merged: CompleteHistoryWindow[] = [];
	for (const current of sorted) {
		const previous = merged.at(-1);
		if (previous !== undefined && current.startTimestamp <= previous.endTimestamp + 1) {
			merged[merged.length - 1] = {
				startTimestamp: previous.startTimestamp,
				endTimestamp: Math.max(previous.endTimestamp, current.endTimestamp),
				dataVersion: current.dataVersion,
			};
		} else {
			merged.push(current);
		}
	}
	return { ...scene, metadata: { ...scene.metadata, [HISTORY_COVERAGE_KEY]: merged.map((item) => ({
		startTimestamp: item.startTimestamp, endTimestamp: item.endTimestamp, dataVersion: item.dataVersion,
	})) } };
}

/** An unverified append cannot inherit a prior completeness claim for the new timeline. */
export function clearCompleteHistoryWindows(scene: ChartScene): ChartScene {
	return { ...scene, metadata: { ...scene.metadata, [HISTORY_COVERAGE_KEY]: [] } };
}

export function applyHistoryCoverageUpdate(scene: ChartScene, update?: HistoryCoverageUpdate): ChartScene {
	return update?.status === 'complete'
		? recordCompleteHistoryWindow(scene, update)
		: clearCompleteHistoryWindows(scene);
}

function hasCompleteHistoryCoverage(scene: ChartScene, startTimestamp: number, endTimestamp: number): boolean {
	return completeHistoryWindows(scene).some((window) =>
		window.startTimestamp <= startTimestamp && window.endTimestamp >= endTimestamp);
}

export interface WeeklyProjectionPoint {
	readonly timestamp: number;
	readonly value: number;
}

export interface WeeklyProjectionSnapshot {
	readonly sourcePeriod: 'week';
	readonly scale: 'linear' | 'logarithmic';
	readonly sourceWeekCount: number;
	readonly stepWeeks: 4;
	readonly start: WeeklyProjectionPoint;
	readonly reference: WeeklyProjectionPoint;
	readonly checkpoints: readonly WeeklyProjectionPoint[];
	readonly future?: { readonly timestamp: number; readonly value: number; readonly virtualWeeks: number };
}

export interface WeeklyRenderProjection {
	readonly points: readonly { readonly dataIndex: number; readonly value: number }[];
	/** Actual bars used for hit testing in the loaded part of the timeline. */
	readonly loadedPoints: readonly WeeklyProjectionPoint[];
	readonly status: 'temporary' | 'exact';
}

function linePoints(drawing: Drawing): readonly WeeklyProjectionPoint[] | null {
	if (drawing.type !== 'segment' && drawing.type !== 'rayLine' && drawing.type !== 'straightLine') {
		return null;
	}
	const points = drawing.geometry.points;
	return points.length === 2 ? points : null;
}

function chartScale(scene: ChartScene): 'linear' | 'logarithmic' {
	return scene.panes.find((pane) => pane.kind === 'candle')
		?.yAxes.find((axis) => axis.role === 'primary')?.scale ?? 'linear';
}

function axisValue(value: number, scale: WeeklyProjectionSnapshot['scale']): number {
	return scale === 'logarithmic' ? Math.log(value) : value;
}

function priceValue(value: number, scale: WeeklyProjectionSnapshot['scale']): number {
	return scale === 'logarithmic' ? Math.exp(value) : value;
}

/** Capture source-week geometry once, when a new weekly trend line is confirmed. */
export function captureWeeklyProjection(drawing: Drawing, scene: ChartScene): Drawing {
	if (scene.period.type !== 'week' || scene.period.span !== 1 || readWeeklyProjection(drawing) !== null) {
		return drawing;
	}
	const points = linePoints(drawing);
	if (points === null || scene.data.length === 0) return drawing;
	const [first, second] = points;
	if (first === undefined || second === undefined || first.timestamp === second.timestamp) return drawing;
	const [start, end] = first.timestamp < second.timestamp ? [first, second] : [second, first];
	const startIndex = scene.data.findIndex((bar) => bar.timestamp === start.timestamp);
	if (startIndex < 0) return drawing;
	const lastIndex = scene.data.length - 1;
	const last = scene.data[lastIndex]!;
	const endIndex = scene.data.findIndex((bar) => bar.timestamp === end.timestamp);
	const future = end.timestamp > last.timestamp;
	if (!future && endIndex <= startIndex) return drawing;
	const scale = chartScale(scene);
	if (scale === 'logarithmic' && (start.value <= 0 || end.value <= 0)) return drawing;
	const virtualWeeks = future
		? Math.max(1, Math.round((end.timestamp - last.timestamp) / (7 * 86_400_000)))
		: 0;
	const referenceIndex = future ? lastIndex : endIndex;
	const slope = (axisValue(end.value, scale) - axisValue(start.value, scale)) /
		(referenceIndex + virtualWeeks - startIndex);
	const atWeek = (index: number): WeeklyProjectionPoint => ({
		timestamp: scene.data[index]!.timestamp,
		value: priceValue(axisValue(start.value, scale) + slope * (index - startIndex), scale),
	});
	const checkpoints: WeeklyProjectionPoint[] = [{ timestamp: start.timestamp, value: start.value }];
	for (let index = startIndex + 4; index < referenceIndex; index += 4) {
		checkpoints.push(atWeek(index));
	}
	const reference = atWeek(referenceIndex);
	if (referenceIndex !== startIndex) checkpoints.push(reference);
	const snapshot: WeeklyProjectionSnapshot = {
		sourcePeriod: 'week', scale, sourceWeekCount: referenceIndex - startIndex,
		stepWeeks: 4, start: { timestamp: start.timestamp, value: start.value },
		reference, checkpoints,
		...(future ? { future: { timestamp: end.timestamp, value: end.value, virtualWeeks } } : {}),
	};
	return {
		...drawing,
		metadata: { ...drawing.metadata, [WEEKLY_PROJECTION_KEY]: snapshot },
	} as unknown as Drawing;
}

export function readWeeklyProjection(drawing: Drawing): WeeklyProjectionSnapshot | null {
	const value = drawing.metadata?.[WEEKLY_PROJECTION_KEY] as Partial<WeeklyProjectionSnapshot> | undefined;
	if (value?.sourcePeriod !== 'week' || value.stepWeeks !== 4 ||
		(value.scale !== 'linear' && value.scale !== 'logarithmic') ||
		!Array.isArray(value.checkpoints) || value.checkpoints.length < 1 ||
		!Number.isSafeInteger(value.sourceWeekCount) || (value.sourceWeekCount ?? -1) < 0 ||
		!isPoint(value.start) || !isPoint(value.reference) ||
		!value.checkpoints.every(isPoint) ||
		(value.sourceWeekCount === 0 && (value.future === undefined || value.checkpoints.length !== 1)) ||
		(value.sourceWeekCount !== 0 && value.checkpoints.length < 2) ||
		(value.future !== undefined &&
			(typeof value.future !== 'object' || value.future === null ||
				!Number.isFinite(value.future.timestamp) || !Number.isFinite(value.future.value) ||
				!Number.isSafeInteger(value.future.virtualWeeks) || value.future.virtualWeeks < 1))) {
		return null;
	}
	return value as WeeklyProjectionSnapshot;
}

function isPoint(value: unknown): value is WeeklyProjectionPoint {
	if (typeof value !== 'object' || value === null) return false;
	const point = value as Partial<WeeklyProjectionPoint>;
	return Number.isFinite(point.timestamp) && Number.isFinite(point.value) && point.value! > 0;
}

const weekFormatters = new Map<string, Intl.DateTimeFormat>();

function weekKey(timestamp: number, timezone: string): number {
	let formatter = weekFormatters.get(timezone);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
		});
		weekFormatters.set(timezone, formatter);
	}
	const parts = formatter.formatToParts(timestamp);
	const part = (type: string): number => Number(parts.find((item) => item.type === type)?.value);
	const date = Date.UTC(part('year'), part('month') - 1, part('day'));
	return date - ((new Date(date).getUTCDay() + 6) % 7) * 86_400_000;
}

function futureSlots(scene: ChartScene, virtualWeeks: number): number {
	const last = scene.data.at(-1)!;
	const lastWeek = weekKey(last.timestamp, scene.chart.timezone);
	const recent = scene.data.filter((bar) =>
		weekKey(bar.timestamp, scene.chart.timezone) >= lastWeek - 3 * 7 * 86_400_000);
	const weekCount = new Set(recent.map((bar) => weekKey(bar.timestamp, scene.chart.timezone))).size;
	return Math.max(1, Math.round(recent.length / weekCount)) * virtualWeeks;
}

/** Target-period rendering uses only source-week checkpoints; it never creates day/hour checkpoints. */
export function projectWeeklyDrawing(drawing: Drawing, scene: ChartScene): WeeklyRenderProjection | null {
	const snapshot = readWeeklyProjection(drawing);
	if (snapshot === null || chartScale(scene) !== snapshot.scale ||
		scene.data.length === 0) return null;
	const weekToBar = new Map<number, number>();
	for (const [index, bar] of scene.data.entries()) {
		weekToBar.set(weekKey(bar.timestamp, scene.chart.timezone), index);
	}
	const mapped = snapshot.checkpoints.flatMap((point) => {
		const index = weekToBar.get(weekKey(point.timestamp, scene.chart.timezone));
		return index === undefined ? [] : [{ index, point }];
	});
	if (mapped.length < 2 && !(mapped.length === 1 && snapshot.sourceWeekCount === 0 && snapshot.future)) return null;
	const left = mapped[0]!;
	const right = mapped.at(-1)!;
	const originalStart = weekToBar.get(weekKey(snapshot.start.timestamp, scene.chart.timezone));
	const firstIndex = originalStart ?? 0;
	const referenceIndex = weekToBar.get(weekKey(snapshot.reference.timestamp, scene.chart.timezone));
	const lastIndex = scene.data.length - 1;
	const remainingFutureWeeks = snapshot.future === undefined ? 0 : Math.max(0,
		Math.round((snapshot.future.timestamp - scene.data[lastIndex]!.timestamp) / (7 * 86_400_000)));
	const endIndex = snapshot.future
		? lastIndex + futureSlots(scene, remainingFutureWeeks)
		: referenceIndex ?? lastIndex;
	const rightIndex = right.index === left.index && snapshot.future !== undefined
		? left.index + futureSlots(scene, snapshot.future.virtualWeeks)
		: right.index;
	const rightValue = right.index === left.index && snapshot.future !== undefined
		? snapshot.future.value
		: right.point.value;
	if (rightIndex === left.index) return null;
	const slope = (axisValue(rightValue, snapshot.scale) - axisValue(left.point.value, snapshot.scale)) /
		(rightIndex - left.index);
	const atIndex = (index: number): number => priceValue(
		axisValue(left.point.value, snapshot.scale) + slope * (index - left.index), snapshot.scale,
	);
	const points = drawing.type === 'straightLine'
		? [left.index, rightIndex]
		: [firstIndex, Math.max(firstIndex + 1, endIndex)];
	return {
		points: points.map((index) => ({ dataIndex: index, value: atIndex(index) })),
		loadedPoints: [
			{ timestamp: scene.data[firstIndex]!.timestamp, value: atIndex(firstIndex) },
			{ timestamp: scene.data[Math.min(endIndex, lastIndex)]!.timestamp, value: atIndex(Math.min(endIndex, lastIndex)) },
		],
		status: snapshot.sourceWeekCount > 0 && originalStart !== undefined && referenceIndex !== undefined &&
			hasCompleteHistoryCoverage(scene, scene.data[originalStart]!.timestamp, scene.data[referenceIndex]!.timestamp)
			? 'exact' : 'temporary',
	};
}
