import { SceneError } from '@baron1996/kline-scene-schema';
import type { BarSpace, Chart, Coordinate } from 'klinecharts';

import { candleCoordinate, candleGeometry, CANDLE_ZOOM_LEVELS, nearestCandleLevel } from './candle-zoom-levels.js';
import { KLINECHARTS_ENGINE_VERSION } from './version.js';

interface Rect { x: number; y: number; width: number; height: number }
interface CandleFigure { name: string; attrs: Rect | Rect[]; styles: Record<string, unknown> }
type CreateBar = (x: number, priceY: number[], space: BarSpace, colors: string[], correction: number) => CandleFigure[];
interface CandleView { _createSolidBar: CreateBar; _createStrokeBar: CreateBar }
interface PinchEvents {
	_event: { _startPinchDistance: number };
	pinchStartEvent(event: Coordinate): boolean;
	pinchEvent(event: Coordinate, scale: number): boolean;
}
interface CandleStore {
	_barSpace: number;
	_totalBarSpace: number;
	_lastBarRightSideDiffBarCount: number;
	_dataList: unknown[];
	getBarSpace(): BarSpace;
	setBarSpace(space: number, before?: () => void): void;
	dataIndexToCoordinate(index: number): number;
	coordinateToFloatIndex(x: number): number;
	zoom(scale: number, coordinate: Partial<Coordinate> | null, position: string): void;
	getLayoutOptions(): { barSpaceLimit: { min: number; max: number } };
}

const installedCharts = new WeakSet<Chart>();
const PINCH_STEP_DISTANCE = 20; // Two-finger separation in CSS px, independent of DPR.

function unavailable(): SceneError {
	return new SceneError('RUNTIME_INIT_FAILED', '/runtime',
		`KLineCharts ${KLINECHARTS_ENGINE_VERSION} candle spacing compatibility hook is unavailable.`);
}

/**
 * Instance-local bridge for pinned 10.0.0. One discrete geometry drives ALL X
 * consumers via the store, including indicators, crosshair and drawing projection.
 * Native Y layout, data loading, pan bounds and zoom anchoring remain in the engine.
 * No prototype/node_modules edits and no post-render correction or onZoom feedback.
 */
export function installCandleSpacing(chart: Chart): void {
	if (installedCharts.has(chart)) return;
	const internal = chart as unknown as {
		_chartEvent?: PinchEvents;
		destroy?: () => void;
		getChartStore?: () => CandleStore;
		getDrawPaneById?: (id: string) => { getMainWidget?: () => { _candleBarView?: CandleView } } | null;
	};
	const store = internal.getChartStore?.();
	const events = internal._chartEvent;
	const view = internal.getDrawPaneById?.('candle_pane')?.getMainWidget?.()._candleBarView;
	if (events === undefined || typeof events.pinchStartEvent !== 'function' ||
		typeof events.pinchEvent !== 'function' ||
		typeof events._event?._startPinchDistance !== 'number' ||
		store === undefined || view === undefined ||
		!['getBarSpace', 'setBarSpace', 'dataIndexToCoordinate', 'coordinateToFloatIndex', 'zoom', 'getLayoutOptions']
			.every(key => typeof (store as unknown as Record<string, unknown>)[key] === 'function') ||
		!Array.isArray(store._dataList) ||
		![store._barSpace, store._totalBarSpace, store._lastBarRightSideDiffBarCount].every(Number.isFinite) ||
		typeof view._createSolidBar !== 'function' || typeof view._createStrokeBar !== 'function' ||
		typeof chart.resize !== 'function' || typeof chart.zoomAtCoordinate !== 'function' ||
		typeof internal.destroy !== 'function') throw unavailable();

	const deviceRatio = () => typeof window === 'undefined' ? 1 : window.devicePixelRatio;
	let geometry = candleGeometry(nearestCandleLevel(store._barSpace, deviceRatio()), deviceRatio());
	const originalSetSpace = store.setBarSpace.bind(store);
	const originalZoom = store.zoom.bind(store);
	const originalResize = chart.resize.bind(chart);
	const updateLimits = () => {
		const limits = store.getLayoutOptions().barSpaceLimit;
		limits.min = candleGeometry(0, geometry.dpr).pitch;
		limits.max = candleGeometry(CANDLE_ZOOM_LEVELS.length - 1, geometry.dpr).pitch;
	};
	// Anchor the lattice at the last bar, NOT index zero. Prepending history then
	// leaves both the raw origin and relative index identical, avoiding half-pixel
	// rounding flips caused by subtracting a growing dataCount * pitch.
	const lastCenter = () => store._totalBarSpace -
		(store._lastBarRightSideDiffBarCount + 0.5) * geometry.pitch;
	store.dataIndexToCoordinate = index => candleCoordinate(lastCenter(), index - store._dataList.length + 1, geometry);
	// Preserve the engine's cell-index convention: a center maps to index + .5.
	// Fractional indexes stay continuous for freehand drawing and hit testing.
	store.coordinateToFloatIndex = x => store._dataList.length - 0.5 +
		(x - candleCoordinate(lastCenter(), 0, geometry)) / geometry.pitch;
	store.getBarSpace = () => ({
		bar: geometry.pitch, halfBar: geometry.pitch / 2,
		gapBar: geometry.body, halfGapBar: geometry.body / 2,
	});
	store.setBarSpace = (space, before) => {
		if (!Number.isFinite(space) || space <= 0) return;
		geometry = candleGeometry(nearestCandleLevel(space, geometry.dpr), geometry.dpr);
		originalSetSpace(geometry.pitch, before);
	};
	updateLimits();
	originalSetSpace(geometry.pitch);

	// Wheel/X-axis inputs move one stop. Pinches supply the number of 20px steps.
	let pinchSteps: number | null = null;
	store.zoom = (scale, coordinate, position) => {
		if (!Number.isFinite(scale) || scale === 0 || pinchSteps === 0) return;
		const next = candleGeometry(geometry.level + (pinchSteps ?? Math.sign(scale)), geometry.dpr);
		originalZoom((next.pitch / geometry.pitch - 1) * 10, coordinate, position);
	};
	const originalPinchStart = events.pinchStartEvent.bind(events);
	const originalPinch = events.pinchEvent.bind(events);
	let consumedDistance = 0;
	events.pinchStartEvent = event => {
		consumedDistance = events._event._startPinchDistance;
		return originalPinchStart(event);
	};
	events.pinchEvent = (event, scale) => {
		const startDistance = events._event._startPinchDistance;
		if (!Number.isFinite(startDistance) || startDistance <= 0 ||
			!Number.isFinite(scale) || scale <= 0) return false;
		const distance = startDistance * scale;
		if (!Number.isFinite(distance)) return false;
		const delta = distance - consumedDistance;
		// Ratios can round an exact 20px boundary a few ULPs below the threshold.
		const tolerance = Number.EPSILON * Math.max(distance, consumedDistance, 1) * 4;
		const steps = Math.sign(delta) * Math.floor((Math.abs(delta) + tolerance) / PINCH_STEP_DISTANCE);
		consumedDistance += steps * PINCH_STEP_DISTANCE;
		pinchSteps = steps;
		try {
			return originalPinch(event, scale);
		} finally {
			pinchSteps = null;
		}
	};
	// API multiplicative targets snap to a stop, at least one for a non-neutral
	// request. No fractional animation frames or per-frame stop overshoot.
	chart.zoomAtCoordinate = (scale, coordinate) => {
		if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return;
		let level = nearestCandleLevel(geometry.pitch * scale, geometry.dpr);
		if (level === geometry.level) level += Math.sign(scale - 1);
		const next = candleGeometry(level, geometry.dpr);
		originalZoom((next.pitch / geometry.pitch - 1) * 10, coordinate ?? null, 'main');
	};
	// Resolve the SAME logical stop on monitor/browser DPR changes.
	chart.resize = () => {
		if (deviceRatio() !== geometry.dpr) {
			geometry = candleGeometry(geometry.level, deviceRatio());
			updateLimits();
			originalSetSpace(geometry.pitch);
		}
		originalResize();
	};
	// A monitor move can change DPR without resizing the CSS container. Observe
	// resolution as well, with explicit disposal so repeated chart mounts cannot leak.
	let resolution: MediaQueryList | undefined;
	const watchResolution = () => {
		resolution?.removeEventListener('change', onResolutionChange);
		if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
			resolution = window.matchMedia(`(resolution: ${geometry.dpr}dppx)`);
			resolution.addEventListener('change', onResolutionChange);
		}
	};
	const onResolutionChange = () => { chart.resize(); watchResolution(); };
	const originalDestroy = internal.destroy.bind(internal);
	internal.destroy = () => {
		resolution?.removeEventListener('change', onResolutionChange);
		originalDestroy();
	};
	watchResolution();

	const wrap = (original: CreateBar): CreateBar => (x, priceY, space, colors, correction) => {
		const figures = original.call(view, x, priceY, space, colors, correction);
		const wick = figures[0];
		const body = figures[1];
		if (figures.length !== 2 || wick?.name !== 'rect' || body?.name !== 'rect' ||
			Array.isArray(body.attrs) || typeof body.attrs?.width !== 'number') throw unavailable();
		body.attrs.x = x - geometry.body / 2;
		body.attrs.width = geometry.body;
		// 10.x strokes inward. Remove parity expansion; center wicks on the true X.
		const wickWidth = Math.min(geometry.body, Math.max(1, Math.round(geometry.dpr)) / geometry.dpr);
		for (const rect of Array.isArray(wick.attrs) ? wick.attrs : [wick.attrs]) {
			rect.x = x - wickWidth / 2;
			rect.width = wickWidth;
		}
		return figures;
	};
	view._createSolidBar = wrap(view._createSolidBar);
	view._createStrokeBar = wrap(view._createStrokeBar);
	installedCharts.add(chart);
}
