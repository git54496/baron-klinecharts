from .errors import SceneError, SceneIssue
from .io import load_scene, save_scene
from .models import ChartScene, MarketData, RuntimeIdentity, SceneData
from .render import (
    build_standalone_html,
    install_browser,
    render_scene_html,
    render_scene_png,
    runtime_template_bytes,
)
from .validation import (
    canonical_scene_bytes,
    canonical_scene_json,
    hash_canonical_scene,
    validate_scene,
)

__all__ = [
    "ChartScene",
    "MarketData",
    "RuntimeIdentity",
    "SceneData",
    "SceneError",
    "SceneIssue",
    "canonical_scene_bytes",
    "canonical_scene_json",
    "hash_canonical_scene",
    "build_standalone_html",
    "install_browser",
    "load_scene",
    "render_scene_html",
    "render_scene_png",
    "runtime_template_bytes",
    "save_scene",
    "validate_scene",
]

__version__ = "0.2.0"
