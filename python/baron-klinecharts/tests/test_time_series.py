from __future__ import annotations

import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from playwright.sync_api import Error as PlaywrightError

from baron_kline import (
    TimeSeriesDefinition,
    TimeSeriesPoint,
    TimeSeriesScene,
    TimeSeriesSceneError,
    build_time_series_standalone_html,
    canonical_time_series_scene_bytes,
    canonical_time_series_scene_json,
    hash_canonical_time_series_scene,
    load_time_series_scene,
    render_time_series_scene_html,
    render_time_series_scene_png,
    save_time_series_scene,
    validate_time_series_scene,
)


def time_series_document() -> dict[str, object]:
    return {
        "schema": "@baron1996/time-series-scene",
        "version": 1,
        "runtime": {
            "engine": "klinecharts",
            "engineVersion": "10.0.0",
            "runtimeVersion": "0.1.0",
        },
        "period": {"span": 1, "type": "day"},
        "series": [{
            "id": "series-a",
            "name": "Series A",
            "type": "line",
            "unit": "unit",
            "precision": 2,
            "visible": True,
            "style": {
                "color": "rgba(96, 165, 250, 1)",
                "size": 2,
                "style": "solid",
            },
        }],
        "data": [
            {"timestamp": 1_767_225_600_000, "values": {"series-a": 12.34}},
            {"timestamp": 1_767_312_000_000, "values": {"series-a": None}},
        ],
        "chart": {
            "locale": "zh-CN",
            "timezone": "Asia/Shanghai",
            "layout": {
                "backgroundColor": "rgba(17, 24, 39, 1)",
                "textColor": "rgba(219, 234, 254, 1)",
                "fontFamily": "Baron Sans",
                "fontSize": 12,
            },
            "grid": {
                "horizontalColor": "rgba(48, 59, 78, 1)",
                "verticalColor": "rgba(48, 59, 78, 1)",
            },
            "thousandsSeparator": ",",
            "decimalFold": {"enabled": False, "threshold": 4},
            "zoomAnchor": "cursor",
            "dateFormat": "yyyy-MM-dd",
            "largeNumberFormat": "chinese",
        },
        "viewport": {
            "barSpace": 8,
            "rightOffsetDistance": 24,
            "anchorTimestamp": 1_767_312_000_000,
        },
        "render": {
            "width": 640,
            "height": 360,
            "deviceScaleFactor": 1,
            "background": "rgba(17, 24, 39, 1)",
            "fontFamily": "Baron Sans",
            "timeoutMs": 10_000,
        },
        "metadata": {},
    }


class TimeSeriesTests(unittest.TestCase):
    def test_models_validate_and_round_trip_without_sharing_mutable_state(self) -> None:
        source = time_series_document()
        scene = TimeSeriesScene.from_dict(source)
        source["metadata"] = {"changed": True}
        exported = scene.to_dict()
        exported["metadata"] = {"alsoChanged": True}

        self.assertIsInstance(scene.series[0], TimeSeriesDefinition)
        self.assertIsInstance(scene.data[0], TimeSeriesPoint)
        self.assertEqual(scene.data[1].values["series-a"], None)
        self.assertEqual(scene.metadata, {})
        self.assertEqual(scene.to_dict(), validate_time_series_scene(time_series_document()))

    def test_canonical_io_and_overwrite_protection(self) -> None:
        scene = TimeSeriesScene.from_dict(time_series_document())
        expected_bytes = canonical_time_series_scene_bytes(scene)
        self.assertEqual(canonical_time_series_scene_json(scene), expected_bytes.decode())
        self.assertEqual(len(hash_canonical_time_series_scene(scene)), 64)

        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "time-series.json"
            save_time_series_scene(scene, output)
            self.assertEqual(output.read_bytes(), expected_bytes)
            self.assertEqual(load_time_series_scene(output).to_dict(), scene.to_dict())
            with self.assertRaises(FileExistsError):
                save_time_series_scene(scene, output)
            save_time_series_scene(scene, output, force=True)

    def test_independent_validation_error(self) -> None:
        invalid = time_series_document()
        invalid["data"] = []
        with self.assertRaises(TimeSeriesSceneError) as captured:
            validate_time_series_scene(invalid)
        self.assertEqual(captured.exception.code, "TIME_SERIES_SCENE_SCHEMA_INVALID")
        self.assertEqual(captured.exception.path, "/data")

    def test_large_finite_numbers_match_the_javascript_number_domain(self) -> None:
        document = time_series_document()
        document["data"][0]["values"]["series-a"] = 10**20
        document["metadata"] = {
            "large": 10**20,
            "exponent": 1.25e-7,
        }

        validated = validate_time_series_scene(document)
        self.assertEqual(validated["data"][0]["values"]["series-a"], 1e20)
        self.assertEqual(validated["metadata"]["large"], 1e20)
        self.assertIn(b'"large":100000000000000000000', canonical_time_series_scene_bytes(document))

        invalid_timestamp = time_series_document()
        invalid_timestamp["data"][0]["timestamp"] = 10**20
        with self.assertRaises(TimeSeriesSceneError) as captured:
            validate_time_series_scene(invalid_timestamp)
        self.assertEqual(captured.exception.path, "/data/0/timestamp")

    def test_structural_and_semantic_errors_use_precise_json_pointers(self) -> None:
        missing_top_level = time_series_document()
        del missing_top_level["metadata"]
        with self.assertRaises(TimeSeriesSceneError) as captured:
            validate_time_series_scene(missing_top_level)
        self.assertEqual(captured.exception.path, "/metadata")

        additional_top_level = time_series_document()
        additional_top_level["bad/key"] = True
        with self.assertRaises(TimeSeriesSceneError) as captured:
            validate_time_series_scene(additional_top_level)
        self.assertEqual(captured.exception.path, "/bad~1key")

        multiple_missing = time_series_document()
        del multiple_missing["render"]
        del multiple_missing["metadata"]
        with self.assertRaises(TimeSeriesSceneError) as captured:
            validate_time_series_scene(multiple_missing)
        self.assertEqual(
            [issue.path for issue in captured.exception.issues],
            ["/render", "/metadata"],
        )

        multiple_additional = time_series_document()
        multiple_additional["z/key"] = True
        multiple_additional["a~key"] = False
        with self.assertRaises(TimeSeriesSceneError) as captured:
            validate_time_series_scene(multiple_additional)
        self.assertEqual(
            [issue.path for issue in captured.exception.issues],
            ["/z~1key", "/a~0key"],
        )

        missing_series_value = time_series_document()
        declared = dict(missing_series_value["series"][0])
        missing_series_value["series"].append({**declared, "id": "series-b"})
        with self.assertRaises(TimeSeriesSceneError) as captured:
            validate_time_series_scene(missing_series_value)
        self.assertEqual(captured.exception.path, "/data/0/values/series-b")

    def test_html_and_png_use_independent_entries(self) -> None:
        scene = TimeSeriesScene.from_dict(time_series_document())
        html = build_time_series_standalone_html(scene)
        self.assertIn("__BARON_KLINE_SCENE__", html)
        self.assertNotIn("__BARON_SCENE_BASE64__", html)

        with tempfile.TemporaryDirectory() as raw_directory:
            directory = Path(raw_directory)
            html_output = directory / "time-series.html"
            png_output = directory / "time-series.png"
            render_time_series_scene_html(scene, html_output)
            self.assertEqual(html_output.read_text(encoding="utf-8"), html)
            render_time_series_scene_png(scene, png_output)
            data = png_output.read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", data[16:24]), (640, 360))

    def test_render_errors_are_independent_and_leave_no_partial_file(self) -> None:
        class MissingBrowserPlaywright:
            def __enter__(self) -> MissingBrowserPlaywright:
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            class Chromium:
                @staticmethod
                def launch(*, headless: bool) -> object:
                    del headless
                    raise PlaywrightError("Executable doesn't exist. playwright install")

            chromium = Chromium()

        scene = TimeSeriesScene.from_dict(time_series_document())
        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "missing-browser.png"
            with patch(
                "baron_kline.render.sync_playwright",
                return_value=MissingBrowserPlaywright(),
            ):
                with self.assertRaises(TimeSeriesSceneError) as captured:
                    render_time_series_scene_png(scene, output)
            self.assertEqual(
                (captured.exception.code, captured.exception.path),
                ("TIME_SERIES_BROWSER_NOT_INSTALLED", "/render"),
            )
            self.assertFalse(output.exists())

    def test_render_timeout_leaves_no_partial_file(self) -> None:
        class TimeoutPage:
            def set_content(self, *_args: object, **_kwargs: object) -> None:
                return None

            def wait_for_function(self, *_args: object, **_kwargs: object) -> None:
                return None

            def evaluate(self, script: str, *_args: object) -> object:
                if "Promise.race" in script:
                    raise PlaywrightError("BARON_TIME_SERIES_RENDER_TIMEOUT")
                return None

        class TimeoutContext:
            def new_page(self) -> TimeoutPage:
                return TimeoutPage()

            def close(self) -> None:
                return None

        class TimeoutBrowser:
            def new_context(self, **_kwargs: object) -> TimeoutContext:
                return TimeoutContext()

            def close(self) -> None:
                return None

        class TimeoutPlaywright:
            def __enter__(self) -> TimeoutPlaywright:
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            class Chromium:
                @staticmethod
                def launch(*, headless: bool) -> TimeoutBrowser:
                    del headless
                    return TimeoutBrowser()

            chromium = Chromium()

        scene = TimeSeriesScene.from_dict(time_series_document())
        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "timeout.png"
            with patch(
                "baron_kline.render.sync_playwright",
                return_value=TimeoutPlaywright(),
            ):
                with self.assertRaises(TimeSeriesSceneError) as captured:
                    render_time_series_scene_png(scene, output)
            self.assertEqual(
                (captured.exception.code, captured.exception.path),
                ("TIME_SERIES_RENDER_TIMEOUT", "/render"),
            )
            self.assertFalse(output.exists())

    def test_render_initialization_failure_is_not_reported_as_timeout(self) -> None:
        class FailedPage:
            def set_content(self, *_args: object, **_kwargs: object) -> None:
                return None

            def wait_for_function(self, *_args: object, **_kwargs: object) -> None:
                return None

            def evaluate(self, script: str, *_args: object) -> object:
                if "Promise.race" in script:
                    raise PlaywrightError("runtime initialization failed")
                return None

        class FailedContext:
            def new_page(self) -> FailedPage:
                return FailedPage()

            def close(self) -> None:
                return None

        class FailedBrowser:
            def new_context(self, **_kwargs: object) -> FailedContext:
                return FailedContext()

            def close(self) -> None:
                return None

        class FailedPlaywright:
            def __enter__(self) -> FailedPlaywright:
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            class Chromium:
                @staticmethod
                def launch(*, headless: bool) -> FailedBrowser:
                    del headless
                    return FailedBrowser()

            chromium = Chromium()

        scene = TimeSeriesScene.from_dict(time_series_document())
        with tempfile.TemporaryDirectory() as raw_directory:
            output = Path(raw_directory) / "initialization-failed.png"
            with patch(
                "baron_kline.render.sync_playwright",
                return_value=FailedPlaywright(),
            ):
                with self.assertRaises(TimeSeriesSceneError) as captured:
                    render_time_series_scene_png(scene, output)
            self.assertEqual(
                (captured.exception.code, captured.exception.path),
                ("TIME_SERIES_RENDER_FAILED", "/render"),
            )
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
