from __future__ import annotations

import json
import struct
import tempfile
import unittest
from pathlib import Path

from baron_kline import (
    DrawableWorkspaceDocument,
    DrawableWorkspaceError,
    build_drawable_workspace_standalone_html,
    canonical_drawable_workspace_bytes,
    render_drawable_workspace_html,
    render_drawable_workspace_png,
)
from baron_kline.drawing_validation import validate_drawable_workspace

from helpers import FIXTURES, REPOSITORY


def load_workspace(name: str) -> dict:
    with (REPOSITORY / "tests" / "fixtures" / "workspaces" / name).open(
        "r",
        encoding="utf-8",
    ) as source:
        return json.load(source)


class DrawableWorkspaceRenderTests(unittest.TestCase):
    def test_workspace_html_is_self_contained_and_uses_workspace_bridge(self) -> None:
        workspace = DrawableWorkspaceDocument.from_dict(
            load_workspace("chart-minimal.json")
        )
        html = build_drawable_workspace_standalone_html(workspace)
        self.assertIn("__BARON_DRAWABLE_WORKSPACE__", html)
        self.assertNotIn("__BARON_SCENE_BASE64__", html)
        self.assertIn('name="baron-playwright-version" content="1.61.0"', html)
        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "workspace.html"
            render_drawable_workspace_html(workspace, output)
            self.assertEqual(output.read_text(encoding="utf-8"), html)

    def test_workspace_html_embeds_exact_canonical_workspace_bytes(self) -> None:
        workspace = load_workspace("chart-minimal.json")
        html = build_drawable_workspace_standalone_html(workspace)
        canonical = canonical_drawable_workspace_bytes(
            validate_drawable_workspace(workspace)
        )
        # 模板里只有一处注入的 Base64 载荷；解码后必须与 Node canonical 字节一致。
        import base64
        import re

        payloads = re.findall(r"[A-Za-z0-9+/=]{200,}", html)
        decoded = [
            base64.b64decode(payload)
            for payload in payloads
            if b"drawable-workspace" in base64.b64decode(payload)
        ]
        self.assertEqual(len(decoded), 1)
        self.assertEqual(decoded[0], canonical)

    def test_workspace_png_matches_scene_dimensions(self) -> None:
        workspace = DrawableWorkspaceDocument.from_dict(
            load_workspace("chart-minimal.json")
        )
        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "workspace.png"
            render_drawable_workspace_png(workspace, output)
            data = output.read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", data[16:24])
            self.assertEqual((width, height), (1000, 600))

    def test_area_workspace_png_keeps_close_line(self) -> None:
        workspace = load_workspace("chart-minimal.json")
        with (FIXTURES / "chart-area-close-line.json").open(
            "r",
            encoding="utf-8",
        ) as source:
            area_scene = json.load(source)
        workspace["scene"]["document"]["chart"]["candle"] = area_scene["chart"][
            "candle"
        ]
        parsed = DrawableWorkspaceDocument.from_dict(workspace)
        self.assertEqual(
            parsed.scene["document"]["chart"]["candle"]["area"]["value"],
            "close",
        )
        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "area-workspace.png"
            render_drawable_workspace_png(parsed, output)
            data = output.read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", data[16:24])
            self.assertEqual((width, height), (1000, 600))

    def test_workspace_api_rejects_raw_scene_without_fallback(self) -> None:
        with (FIXTURES / "minimal-valid.json").open(
            "r",
            encoding="utf-8",
        ) as source:
            raw_scene = json.load(source)
        with self.assertRaises(DrawableWorkspaceError) as raised:
            build_drawable_workspace_standalone_html(raw_scene)
        self.assertEqual(raised.exception.code, "DRAWABLE_WORKSPACE_SCHEMA_INVALID")


if __name__ == "__main__":
    unittest.main()
