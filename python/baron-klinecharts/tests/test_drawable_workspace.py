from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from baron_kline import (
    DrawableWorkspaceDocument,
    DrawableWorkspaceError,
    canonical_drawable_workspace_bytes,
    hash_canonical_drawable_workspace,
    load_drawable_workspace,
    load_drawing_document,
    save_drawable_workspace,
)

from helpers import FIXTURES

WORKSPACES = FIXTURES.parent / "workspaces"
DRAWINGS = FIXTURES.parent / "drawings"


class DrawableWorkspaceContractTest(unittest.TestCase):
    def test_loads_both_scene_branches_and_round_trips(self) -> None:
        chart = load_drawable_workspace(WORKSPACES / "chart-minimal.json")
        self.assertEqual(chart.scene["kind"], "chart")
        self.assertEqual(len(chart.drawings.drawings), 22)
        self.assertEqual(
            hash_canonical_drawable_workspace(chart),
            hash_canonical_drawable_workspace(chart.to_dict()),
        )

        time_series = load_drawable_workspace(
            WORKSPACES / "time-series-minimal.json"
        )
        self.assertEqual(time_series.scene["kind"], "time-series")
        self.assertEqual(
            time_series.binding["valueAxes"][0]["paneRole"],
            "time-series",
        )

    def test_accepts_area_scene_workspace(self) -> None:
        with (FIXTURES / "chart-area-close-line.json").open(
            "r",
            encoding="utf-8",
        ) as source:
            area_scene = __import__("json").load(source)
        drawings = load_drawing_document(DRAWINGS / "all-drawings.json").to_dict()
        workspace = {
            "schema": "@baron1996/drawable-workspace",
            "version": 1,
            "runtime": {
                "engine": "klinecharts",
                "engineVersion": "10.0.0",
                "workspaceRuntimeVersion": "1.0.0",
            },
            "scene": {"kind": "chart", "document": area_scene},
            "drawings": drawings,
            "binding": {
                "scopeKey": drawings["scopeKey"],
                "timezone": drawings["coordinateSystem"]["timezone"],
                "valueAxes": drawings["coordinateSystem"]["valueAxes"],
            },
            "metadata": {},
        }
        parsed = DrawableWorkspaceDocument.from_dict(workspace)
        self.assertEqual(
            parsed.scene["document"]["chart"]["candle"]["type"],
            "area",
        )

    def test_rejects_double_authority_and_binding_mismatches(self) -> None:
        cases = {
            "invalid-double-authority.json": (
                "DRAWABLE_WORKSPACE_DOUBLE_AUTHORITY",
                "/scene/document/overlays",
            ),
        }
        for name, (code, path) in cases.items():
            with self.subTest(name=name):
                with self.assertRaises(DrawableWorkspaceError) as context:
                    load_drawable_workspace(WORKSPACES / name)
                self.assertEqual(context.exception.code, code)
                self.assertEqual(context.exception.path, path)

        chart = load_drawable_workspace(WORKSPACES / "chart-minimal.json")
        value = chart.to_dict()
        value["binding"]["scopeKey"] = "other-scope"
        with self.assertRaises(DrawableWorkspaceError) as context:
            DrawableWorkspaceDocument.from_dict(value)
        self.assertEqual(
            context.exception.code,
            "DRAWABLE_WORKSPACE_BINDING_MISMATCH",
        )
        self.assertEqual(context.exception.path, "/binding/scopeKey")

    def test_rejects_raw_scene(self) -> None:
        with (FIXTURES / "minimal-valid.json").open(
            "r",
            encoding="utf-8",
        ) as source:
            raw_scene = __import__("json").load(source)
        with self.assertRaises(DrawableWorkspaceError) as context:
            DrawableWorkspaceDocument.from_dict(raw_scene)
        self.assertEqual(
            context.exception.code,
            "DRAWABLE_WORKSPACE_SCHEMA_INVALID",
        )

    def test_save_force_and_reload(self) -> None:
        workspace = load_drawable_workspace(WORKSPACES / "chart-minimal.json")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "workspace.json"
            save_drawable_workspace(workspace, output)
            with self.assertRaises(FileExistsError):
                save_drawable_workspace(workspace, output)
            save_drawable_workspace(workspace, output, force=True)
            reloaded = load_drawable_workspace(output)
            self.assertEqual(
                canonical_drawable_workspace_bytes(workspace),
                canonical_drawable_workspace_bytes(reloaded),
            )
