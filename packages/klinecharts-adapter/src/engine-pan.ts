import { SceneError } from '@baron1996/kline-scene-schema';
import type { Chart, YAxis, AxisRange } from 'klinecharts';

import { KLINECHARTS_ENGINE_VERSION } from './version.js';

interface PanAxis extends YAxis {
	getRange(): AxisRange;
	setRange(range: AxisRange): void;
}

interface PanWidget {
	getPane(): { getYAxisComponents(): PanAxis[] };
	getBounding(): { height: number };
}

interface PanEvent {
	x: number;
	y: number;
	preventDefault?: () => void;
}

interface PanInternals {
	_startScrollCoordinate: { x: number; y: number } | null;
	_processMainScrollingEvent: (widget: PanWidget, event: PanEvent) => void;
}

/** Translate in the coordinate system used by convertToPixel, not in raw prices. */
export function translatePanRange(
	axis: Pick<PanAxis, 'name' | 'reverse' | 'realValueToValue' | 'realValueToDisplayValue'>,
	start: AxisRange,
	deltaY: number,
	height: number,
): AxisRange | null {
	if (!(height > 0) || !(start.realRange > 0)) return null;
	const shift = (axis.reverse ? -deltaY : deltaY) / height * start.realRange;
	const realFrom = start.realFrom + shift;
	const realTo = start.realTo + shift;
	// KLineCharts 10's signed logarithm inverse treats negative log coordinates
	// as negative prices. Positive prices below 1 still need the positive inverse.
	const positiveLog = axis.name === 'logarithm' && start.from > 0 && start.to > 0;
	const from = positiveLog ? 10 ** realFrom : axis.realValueToValue(realFrom, { range: start });
	const to = positiveLog ? 10 ** realTo : axis.realValueToValue(realTo, { range: start });
	const displayFrom = positiveLog ? from : axis.realValueToDisplayValue(realFrom, { range: start });
	const displayTo = positiveLog ? to : axis.realValueToDisplayValue(realTo, { range: start });
	const result = {
		from, to, range: to - from,
		realFrom, realTo, realRange: start.realRange,
		displayFrom, displayTo, displayRange: displayTo - displayFrom,
	};
	// Never commit an overflowed/collapsed range after an extreme drag.
	return Object.values(result).every(Number.isFinite) && to > from && realTo > realFrom
		? result
		: null;
}

/**
 * KLineCharts 10.0.0 has no public pan-range hook. Like the click arbitration
 * bridge, this instance-local compatibility shim is guarded by engine identity
 * and fails explicitly if the private event boundary changes.
 * Axis zoom, drawings and pointer arbitration remain owned by the engine.
 */
export function installScalePreservingPan(chart: Chart): void {
	const internal = chart as unknown as {
		_chartEvent?: PanInternals;
		getChartStore?: () => { scroll(distance: number): void };
	};
	const events = internal._chartEvent;
	if (events === undefined ||
		typeof events._processMainScrollingEvent !== 'function' ||
		!('_startScrollCoordinate' in events) ||
		typeof internal.getChartStore !== 'function') {
		throw new SceneError('RUNTIME_INIT_FAILED', '/runtime',
			`KLineCharts ${KLINECHARTS_ENGINE_VERSION} pan compatibility hook is unavailable.`);
	}
	const store = internal.getChartStore();
	let gesture: { x: number; y: number } | null = null;
	let ranges = new Map<PanAxis, AxisRange>();
	events._processMainScrollingEvent = (widget, event) => {
		const start = events._startScrollCoordinate;
		if (start === null || !chart.isScrollEnabled()) return;
		const deltaX = event.x - start.x;
		const deltaY = event.y - start.y;
		if (gesture !== start) {
			// A click (or an overlay consuming the gesture) must not disable auto-fit.
			if (deltaX === 0 && deltaY === 0) return;
			gesture = start;
			ranges = new Map();
			// All panes share X. Freeze their enabled Y axes before scrolling can
			// recalculate visible extrema, including a gesture starting in auto-fit.
			for (const item of chart.getYAxes({})) {
				const axis = item as PanAxis;
				if (!axis.scrollZoomEnabled) continue;
				const range = { ...axis.getRange() };
				if (!Object.values(range).every(Number.isFinite) || !(range.realRange > 0)) continue;
				ranges.set(axis, range);
				axis.setRange(range);
			}
		}
		event.preventDefault?.();
		for (const axis of widget.getPane().getYAxisComponents()) {
			const range = ranges.get(axis);
			if (range === undefined || !axis.scrollZoomEnabled) continue;
			const translated = translatePanRange(axis, range, deltaY, widget.getBounding().height);
			if (translated !== null) axis.setRange(translated);
		}
		// This preserves the engine's bounds, historical loading and scroll events.
		// Keep the ranges manual on release; double-clicking Y restores auto-fit.
		store.scroll(deltaX);
	};
}
