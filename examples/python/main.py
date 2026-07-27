from __future__ import annotations

import sys
from pathlib import Path

from baron_kline import load_scene, render_scene_html, render_scene_png

repository = Path(__file__).resolve().parents[2]
scene = load_scene(repository / "tests" / "fixtures" / "scenes" / "all-overlays.json")
output = (
    Path(sys.argv[1]).resolve()
    if len(sys.argv) > 1
    else Path(__file__).resolve().parent / "output"
)
output.mkdir(exist_ok=True)
render_scene_html(scene, output / "scene.html", force=True)
render_scene_png(scene, output / "scene.png", force=True)
