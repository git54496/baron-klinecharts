# baron-klinecharts

Python SDK for the Baron KLineCharts `ChartScene` format.

```bash
pip install baron-klinecharts==0.9.8
python -m playwright install chromium
```

The package validates and canonicalizes static, embedded market data and renders the
same deterministic ChartScene used by the Web and npm runtimes. It never downloads a
browser or market data implicitly.

DrawableWorkspace documents have explicit render helpers that embed and drive the
same TypeScript offline Runtime template and Playwright browser; Python never
reimplements drawing projection, main-series switching, or canvas rendering.

```python
from baron_kline import (
    load_drawable_workspace,
    render_drawable_workspace_html,
    render_drawable_workspace_png,
)

workspace = load_drawable_workspace("workspace.json")
render_drawable_workspace_html(workspace, "workspace.html")
render_drawable_workspace_png(workspace, "workspace.png")
```

Raw `ChartScene`/`TimeSeriesScene` inputs are rejected by the Workspace helpers and
vice versa; the package does not guess a root document type.
