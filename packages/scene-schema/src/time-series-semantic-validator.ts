import type { TimeSeriesScene } from './generated/time-series-scene.js';
import {
	TimeSeriesSceneError,
	type TimeSeriesSceneIssue,
} from './time-series-errors.js';

function pointerToken(value: string): string {
	return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function collectTimeSeriesSemanticIssues(
	scene: TimeSeriesScene,
): readonly TimeSeriesSceneIssue[] {
	const issues: TimeSeriesSceneIssue[] = [];
	const seriesIds = new Set<string>();
	const firstSeries = scene.series[0];

	for (const [index, series] of scene.series.entries()) {
		if (seriesIds.has(series.id)) {
			issues.push({
				code: 'TIME_SERIES_SCENE_SCHEMA_INVALID',
				path: `/series/${index}/id`,
				message: `Duplicate time series id: ${series.id}.`,
			});
		}
		seriesIds.add(series.id);
		if (series.unit !== firstSeries.unit) {
			issues.push({
				code: 'TIME_SERIES_SCENE_SCHEMA_INVALID',
				path: `/series/${index}/unit`,
				message: 'All time series must use the same unit.',
			});
		}
		if (series.precision !== firstSeries.precision) {
			issues.push({
				code: 'TIME_SERIES_SCENE_SCHEMA_INVALID',
				path: `/series/${index}/precision`,
				message: 'All time series must use the same precision.',
			});
		}
	}

	let previousTimestamp: number | undefined;
	const timestamps = new Set<number>();
	for (const [index, point] of scene.data.entries()) {
		if (
			previousTimestamp !== undefined &&
			point.timestamp <= previousTimestamp
		) {
			issues.push({
				code: 'TIME_SERIES_SCENE_SCHEMA_INVALID',
				path: `/data/${index}/timestamp`,
				message: 'Time series timestamps must be strictly increasing.',
			});
		}
		previousTimestamp = point.timestamp;
		timestamps.add(point.timestamp);

		const valueIds = Object.keys(point.values);
		for (const seriesId of seriesIds) {
			if (!Object.hasOwn(point.values, seriesId)) {
				issues.push({
					code: 'TIME_SERIES_SCENE_SCHEMA_INVALID',
					path: `/data/${index}/values/${pointerToken(seriesId)}`,
					message: `Missing value for time series: ${seriesId}.`,
				});
			}
		}
		for (const valueId of valueIds) {
			if (!seriesIds.has(valueId)) {
				issues.push({
					code: 'TIME_SERIES_SCENE_SCHEMA_INVALID',
					path: `/data/${index}/values/${pointerToken(valueId)}`,
					message: `Unknown time series value key: ${valueId}.`,
				});
			}
		}
	}

	if (!timestamps.has(scene.viewport.anchorTimestamp)) {
		issues.push({
			code: 'TIME_SERIES_SCENE_SCHEMA_INVALID',
			path: '/viewport/anchorTimestamp',
			message: 'Viewport anchorTimestamp must reference a data point.',
		});
	}

	return issues;
}

export function assertSemanticTimeSeriesScene(scene: TimeSeriesScene): void {
	const issues = collectTimeSeriesSemanticIssues(scene);
	const first = issues[0];
	if (first !== undefined) {
		throw new TimeSeriesSceneError(
			first.code,
			first.path,
			first.message,
			issues,
		);
	}
}
