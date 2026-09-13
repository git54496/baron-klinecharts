import { describe, expect, it } from 'vitest';
import type { ChartScene, Drawing } from '../src/index.js';
import {
	captureWeeklyProjection,
	applyHistoryCoverageUpdate,
	clearCompleteHistoryWindows,
	HISTORY_COVERAGE_KEY,
	projectWeeklyDrawing,
	readWeeklyProjection,
	recordCompleteHistoryWindow,
} from '../src/index.js';

const timestamp = (date: string): number => Date.parse(`${date}T07:00:00Z`);
const days = ['2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31', '2026-08-07'];
const bars = (dates: readonly string[]) => dates.map((date) => ({ timestamp: timestamp(date) }));
const scene = (period: ChartScene['period'], dates: readonly string[]): ChartScene => ({
	period, data: bars(dates), chart: { timezone: 'Asia/Shanghai' },
	panes: [{ kind: 'candle', yAxes: [{ role: 'primary', scale: 'linear' }] }],
	metadata: { 'baron.historyCoverage.v1': [{
		startTimestamp: timestamp(dates[0]!), endTimestamp: timestamp(dates.at(-1)!), dataVersion: 'mock-v1',
	}] },
} as unknown as ChartScene);
const line = (endDate: string): Drawing => ({
	id: 'line', type: 'segment',
	geometry: { points: [
		{ timestamp: timestamp(days[0]!), granularity: { type: 'week', span: 1 }, value: 20 },
		{ timestamp: timestamp(endDate), granularity: { type: 'week', span: 1 }, value: 40 },
	] },
} as unknown as Drawing);

describe('weekly progressive projection', () => {
	it('marks only a new source-week line and samples every four real weekly bars', () => {
		const weekly = scene({ type: 'week', span: 1 }, days);
		const captured = captureWeeklyProjection(line(days[5]!), weekly);
		const snapshot = readWeeklyProjection(captured);
		expect(snapshot?.sourceWeekCount).toBe(5);
		expect(snapshot?.checkpoints.map((point) => point.timestamp)).toEqual(
		[days[0], days[4], days[5]].map(timestamp),
		);
		expect(readWeeklyProjection(captureWeeklyProjection(line(days[5]!),
			scene({ type: 'day', span: 1 }, days)))).toBeNull();
	});

	it('uses source-week checkpoints, then upgrades to the original anchors without mutating them', () => {
		const captured = captureWeeklyProjection(line(days[5]!), scene({ type: 'week', span: 1 }, days));
		const tradingDays: string[] = [];
		for (let day = Date.parse('2026-07-01T00:00:00Z'); day <= Date.parse('2026-08-07T00:00:00Z'); day += 86_400_000) {
			const date = new Date(day);
			if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) tradingDays.push(date.toISOString().slice(0, 10));
		}
		const full = projectWeeklyDrawing(captured, scene({ type: 'day', span: 1 }, tradingDays));
		const recent = projectWeeklyDrawing(captured, scene({ type: 'day', span: 1 }, tradingDays.slice(-10)));
		expect(recent?.status).toBe('temporary');
		expect(full?.status).toBe('exact');
		expect(full?.points).toHaveLength(2);
		expect(readWeeklyProjection(captured)?.start.value).toBe(20);
	});

	it('fixes the draw-time latest weekly bar as R when F is in the future', () => {
		const captured = captureWeeklyProjection(line('2026-09-04'), scene({ type: 'week', span: 1 }, days));
		const snapshot = readWeeklyProjection(captured);
		expect(snapshot?.reference.timestamp).toBe(timestamp(days[5]!));
		expect(snapshot?.future?.timestamp).toBe(timestamp('2026-09-04'));
		expect(snapshot?.reference.value).toBeLessThan(40);
	});

	it('projects a weekly source when returning to a partially loaded weekly chart', () => {
		const captured = captureWeeklyProjection(line(days[5]!), scene({ type: 'week', span: 1 }, days));
		const recent = projectWeeklyDrawing(captured, scene({ type: 'week', span: 1 }, days.slice(3)));
		const full = projectWeeklyDrawing(captured, scene({ type: 'week', span: 1 }, days));
		expect(recent?.status).toBe('temporary');
		expect(full?.status).toBe('exact');
		expect(recent?.points).toHaveLength(2);
	});

	it('captures the chronological anchors even when drawn right to left', () => {
		const reversed = line(days[5]!);
		const points = [...reversed.geometry.points].reverse();
		const captured = captureWeeklyProjection({
			...reversed, geometry: { ...reversed.geometry, points },
		}, scene({ type: 'week', span: 1 }, days));
		expect(readWeeklyProjection(captured)?.sourceWeekCount).toBe(5);
	});

	it('keeps a draw-time latest K anchor usable when A and R are the same week', () => {
		const newLine = {
			...line('2026-09-04'),
			geometry: { points: [
				{ timestamp: timestamp(days[5]!), value: 30 },
				{ timestamp: timestamp('2026-09-04'), value: 40 },
			] },
		} as Drawing;
		const captured = captureWeeklyProjection(newLine, scene({ type: 'week', span: 1 }, days));
		expect(readWeeklyProjection(captured)?.sourceWeekCount).toBe(0);
		expect(projectWeeklyDrawing(captured, scene({ type: 'week', span: 1 }, days))?.points).toHaveLength(2);
	});

	it('does not move a fixed target bar after an exact projection gets older history', () => {
		const captured = captureWeeklyProjection(line(days[5]!), scene({ type: 'week', span: 1 }, days));
		const target = '2026-07-24';
		const current = projectWeeklyDrawing(captured, scene({ type: 'day', span: 1 }, [
			'2026-07-03', '2026-07-10', '2026-07-17', target, '2026-07-31', '2026-08-07',
		]));
		const older = projectWeeklyDrawing(captured, scene({ type: 'day', span: 1 }, [
			'2026-06-19', '2026-06-26', '2026-07-03', '2026-07-10', '2026-07-17', target,
			'2026-07-31', '2026-08-07',
		]));
		const at = (projection: NonNullable<typeof current>, index: number): number => {
			const [left, right] = projection.points;
			return left!.value + (right!.value - left!.value) * (index - left!.dataIndex) /
				(right!.dataIndex - left!.dataIndex);
		};
		expect(current?.status).toBe('exact');
		expect(older?.status).toBe('exact');
		expect(at(current!, 3)).toBeCloseTo(at(older!, 5), 10);
	});

	it('withholds exact status until a complete interval covers both target anchors', () => {
		const captured = captureWeeklyProjection(line(days[5]!), scene({ type: 'week', span: 1 }, days));
		const full = scene({ type: 'day', span: 1 }, days);
		expect(projectWeeklyDrawing(captured, clearCompleteHistoryWindows(full))?.status).toBe('temporary');
		const partial = recordCompleteHistoryWindow(clearCompleteHistoryWindows(full), {
			startTimestamp: timestamp(days[1]!), endTimestamp: timestamp(days[5]!), dataVersion: 'mock-v1',
		});
		expect(projectWeeklyDrawing(captured, partial)?.status).toBe('temporary');
		expect(projectWeeklyDrawing(captured, full)?.status).toBe('exact');
	});

	it('joins adjacent complete history windows and revokes the claim after an incomplete append', () => {
		const captured = captureWeeklyProjection(line(days[5]!), scene({ type: 'week', span: 1 }, days));
		const initial = clearCompleteHistoryWindows(scene({ type: 'day', span: 1 }, days));
		const first = recordCompleteHistoryWindow(initial, {
			startTimestamp: timestamp(days[0]!), endTimestamp: timestamp(days[2]!) - 1, dataVersion: 'mock-v1',
		});
		const joined = recordCompleteHistoryWindow(first, {
			startTimestamp: timestamp(days[2]!), endTimestamp: timestamp(days[5]!), dataVersion: 'mock-v1',
		});
		expect(joined.metadata?.[HISTORY_COVERAGE_KEY]).toEqual([{
			startTimestamp: timestamp(days[0]!), endTimestamp: timestamp(days[5]!), dataVersion: 'mock-v1',
		}]);
		expect(projectWeeklyDrawing(captured, joined)?.status).toBe('exact');
		const incomplete = applyHistoryCoverageUpdate(joined, {
			status: 'incomplete', startTimestamp: timestamp(days[0]!), endTimestamp: timestamp(days[5]!), dataVersion: 'mock-v1',
		});
		expect(projectWeeklyDrawing(captured, incomplete)?.status).toBe('temporary');
		const revised = recordCompleteHistoryWindow(joined, {
			startTimestamp: timestamp(days[2]!), endTimestamp: timestamp(days[5]!), dataVersion: 'mock-v2',
		});
		expect(projectWeeklyDrawing(captured, revised)?.status).toBe('temporary');
	});
});
