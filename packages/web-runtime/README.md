# @baron1996/klinecharts-runtime

Browser editing runtime and standard annotation toolbar for deterministic KLineCharts
ChartScene files.

```bash
npm install --save-exact @baron1996/kline-scene-schema@0.6.0 @baron1996/klinecharts-runtime@0.9.3
```

```ts
import { parseChartScene } from '@baron1996/kline-scene-schema';
import {
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

`displayTimezone` is a presentation-only IANA timezone override. It changes the
KLineCharts time axis and adds the active timezone to tooltip dates, but it is not
written into the Workspace and does not change candle timestamps, period rules,
Drawing projection, or host alerts. Omit it to use the Scene chart timezone.

The coordinator never derives `scopeKey` from `scene.symbol.ticker`, never accesses
the KLineCharts `Chart`, and never converts legacy `ChartScene.overlays` into a
Workspace. A Scene switch changes only `workspace.scene`; the confirmed
`DrawingDocument` remains byte-identical.
