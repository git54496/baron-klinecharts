from __future__ import annotations

import struct
import tempfile
import unittest
from pathlib import Path

from baron_kline import (
    ChartScene,
    build_standalone_html,
    render_scene_html,
    render_scene_png,
)

from helpers import load_fixture


class RenderTests(unittest.TestCase):
    def test_html_is_self_contained_and_editable(self) -> None:
        scene = ChartScene.from_dict(load_fixture("minimal-valid.json"))
        html = build_standalone_html(scene)
        self.assertIn("__BARON_KLINE_SCENE__", html)
        self.assertNotIn("__BARON_SCENE_BASE64__", html)
        self.assertIn('name="baron-playwright-version" content="1.61.0"', html)
        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "scene.html"
            render_scene_html(scene, output)
            self.assertEqual(output.read_text(encoding="utf-8"), html)

    def test_png_matches_scene_dimensions(self) -> None:
        scene = ChartScene.from_dict(load_fixture("minimal-valid.json"))
        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "scene.png"
            render_scene_png(scene, output)
            data = output.read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", data[16:24])
            self.assertEqual((width, height), (1000, 600))


if __name__ == "__main__":
    unittest.main()
