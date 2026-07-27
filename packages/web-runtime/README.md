# @baron1996/klinecharts-runtime

Browser editing runtime and standard annotation toolbar for deterministic KLineCharts
ChartScene files.

```bash
npm install @baron1996/klinecharts-runtime
```

```ts
import {
  createKLineSceneRuntime,
  createStandardToolbar,
} from '@baron1996/klinecharts-runtime';

const runtime = await createKLineSceneRuntime(container, scene);
const toolbar = createStandardToolbar(toolbarContainer, runtime);

const exportedScene = runtime.exportScene();

toolbar.destroy();
runtime.destroy();
```

The runtime does not provide undo or redo and does not fetch market data.
