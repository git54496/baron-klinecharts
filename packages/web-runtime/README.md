# @baron1996/klinecharts-runtime

Browser editing runtime and standard annotation toolbar for deterministic KLineCharts
ChartScene files.

```bash
npm install --save-exact @baron1996/kline-scene-schema@0.2.0 @baron1996/klinecharts-runtime@0.2.0
```

```ts
import { parseChartScene } from '@baron1996/kline-scene-schema';
import { createKLineSceneRuntime } from '@baron1996/klinecharts-runtime';

// chartSceneInput is a complete embedded ChartScene JSON value from the host.
const scene = parseChartScene(chartSceneInput);
let runtime = await createKLineSceneRuntime(container, scene);

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
runtime.destroy();

runtime = await createKLineSceneRuntime(
  container,
  JSON.parse(serializedScene),
);
```

The runtime does not provide undo or redo and does not fetch market data.
Runtime `0.2.0` events are structured-cloneable pure data with
`sceneVersion: 1` and `runtimeVersion: '0.2.0'`. Measurement scenes persist only
their two data-coordinate endpoints, styles, and opaque metadata; displayed absolute
and percentage changes are derived.
