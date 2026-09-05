# @baron1996/klinecharts-runtime

Browser editing runtime and standard annotation toolbar for deterministic KLineCharts
ChartScene files.

```bash
npm install --save-exact @baron1996/kline-scene-schema@0.9.16 @baron1996/klinecharts-runtime@0.9.16
```

```ts
import { parseChartScene } from '@baron1996/kline-scene-schema';
import {
  createChartWorkspaceToolbar,
  createDrawingFloatingToolbar,
  createKLineSceneRuntime,
  createStandardToolbar,
} from '@baron1996/klinecharts-runtime';

// chartSceneInput is a complete embedded ChartScene JSON value from the host.
const scene = parseChartScene(chartSceneInput);
let runtime = await createKLineSceneRuntime(container, scene);
const standardToolbar = createStandardToolbar(toolbarContainer, runtime);
const drawingToolbar = createDrawingFloatingToolbar(container, runtime);

await runtime.setPriceScale('linear');
runtime.startOverlayDrawing('priceMeasurement');

const overlayId = runtime.startOverlayDrawing('horizontalStraightLine');
const drawingCompleted = new Promise<void>((resolve) => {
  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === 'overlay-created' && event.overlay.id === overlayId) {
      unsubscribe();
      resolve();
    }
  });
});

// One pointer interaction inside container completes the horizontal line.
await drawingCompleted;
const exportedScene = runtime.exportScene();
const serializedScene = JSON.stringify(exportedScene);
drawingToolbar.destroy();
standardToolbar.destroy();
runtime.destroy();

runtime = await createKLineSceneRuntime(
  container,
  JSON.parse(serializedScene),
);
```

`createStandardToolbar` owns chart-level controls such as price scale and main-series
presentation. Selecting a Drawing shows `createDrawingFloatingToolbar`, which owns
line style, width, color, text, lock/unlock, and explicit deletion. The floating
toolbar can be dragged within the chart's visible bounds. Baron does not replace or
cancel the browser context menu; right-click never deletes a Drawing.

For a chart Workspace, `createChartWorkspaceToolbar` provides the split layout used
by professional charting screens: period and display controls at the top, and Drawing
tools on the left. Period and adjustment actions remain opaque host actions. Main
indicators are calculated by KLineCharts in the browser from the Scene OHLC data.

```ts
const toolbar = createChartWorkspaceToolbar(
  { top: topToolbarContainer, left: leftToolbarContainer },
  runtime,
  {
    periodActions: [
      { actionId: 'period.1h', label: '1小时', pressed: true },
      { actionId: 'period.1d', label: '日' },
    ],
    settingsHostActions: [
      { actionId: 'adjustment.qfq', label: '前复权', pressed: true },
    ],
    displayTimezoneChoices: [
      { value: 'instrument', label: '标的时区', timezone: 'Asia/Shanghai' },
      { value: 'utc', label: 'UTC', timezone: 'UTC' },
    ],
    activeDisplayTimezoneValue: 'instrument',
    fullscreenTarget: chartWorkspaceElement,
  },
);
```

The indicator menu currently manages main-pane `MA`, `EMA`, `SMA`, `BOLL`, `SAR`,
and `BBI`. `replaceScene()` preserves these Runtime-owned selections by default, so
a host can fetch and install another historical period without adding indicator
fields to its datafeed request. Pass `{ preserveMainIndicators: false }` only when an
explicit reset is required. Secondary indicator panes are outside this API.

The runtime does not provide undo or redo and does not fetch market data.
Runtime `0.2.0` events are structured-cloneable pure data with
`sceneVersion: 1` and `runtimeVersion: '0.2.0'`. Measurement scenes persist only
their two data-coordinate endpoints, styles, and opaque metadata; displayed absolute
and percentage changes are derived.

## Cross-period Drawing orchestration

Cross-period Drawing uses the existing `DrawableWorkspaceRuntime` in explicit
`host-confirmed` mode. The coordinator binds a host-owned stable instrument key to
the Workspace `scopeKey`, loads a complete replacement Scene through a host port,
and commits a Drawing candidate only after the persistence receipt returns the exact
Runtime canonical hash.

```ts
import {
  createCrossPeriodDrawingCoordinator,
  createDrawableWorkspaceRuntime,
} from '@baron1996/klinecharts-runtime';

const runtime = await createDrawableWorkspaceRuntime(container, loadedWorkspace, {
  commitMode: 'host-confirmed',
  displayTimezone: 'UTC',
  drawingInteraction: {
    touch: 'precision-cursor',
    exclusiveSelection: true,
    hitTolerance: {
      mouse: { body: 12, anchor: 14 },
      touch: { body: 22, anchor: 24 },
    },
  },
});

const coordinator = createCrossPeriodDrawingCoordinator(
  runtime,
  {
    instrumentKey: 'CN:600519',
    scopeKey: loadedWorkspace.drawings.scopeKey,
  },
  {
    initialRevision: loadedRevision,
    async loadScene({ binding, period, currentWorkspace }) {
      // The host assembles a complete Scene. Financial market data must come
      // through fxxking-data.
      return hostSceneLoader.load({ binding, period, currentWorkspace });
    },
    async persistCandidate(request) {
      // owner, permissions, audit and database transactions stay in the host.
      return drawingRepository.compareAndSet(request);
    },
  },
);

await coordinator.switchPeriod({ type: 'week', span: 1 });
await coordinator.waitForIdle();

coordinator.destroy();
runtime.destroy();
```

`displayTimezone` is the initial presentation-only IANA timezone override, and
`runtime.setDisplayTimezone(timezone)` changes it in place. It changes the
KLineCharts time axis and adds the active timezone to tooltip dates, but it is not
written into the Workspace and does not change candle timestamps, period rules,
Drawing projection, or host alerts. Omit it to use the Scene chart timezone.

`drawingInteraction.touch: 'precision-cursor'` enables the mobile precision flow for
`segment`: moving a touch positions an offset virtual crosshair, while a stationary
tap confirms each endpoint. The mode is selected from the actual touch pointer type,
so mouse input keeps KLineCharts' native two-click behavior even when the option is
enabled. The guide UI and interaction state are transient and are never written into
the Workspace. Omit the option (or use `touch: 'native'`) for native touch behavior.

`drawingInteraction.exclusiveSelection` routes existing Drawing selection and dragging
through the adapter. While a Drawing is selected, chart scrolling, zooming, and the
crosshair are suspended. The first blank pointer gesture only clears the selection;
the following gesture returns to chart navigation. `hitTolerance` uses CSS pixels and
defaults to a 24px mouse body band and a 44px touch body band, with 14px and 24px anchor
radii respectively.

The coordinator never derives `scopeKey` from `scene.symbol.ticker`, never accesses
the KLineCharts `Chart`, and never converts legacy `ChartScene.overlays` into a
Workspace. A Scene switch changes only `workspace.scene`; the confirmed
`DrawingDocument` remains byte-identical.
