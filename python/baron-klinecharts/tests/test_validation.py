from __future__ import annotations

import unittest

from baron_kline import SceneError, validate_scene

from helpers import load_fixture


class ValidationTests(unittest.TestCase):
    def test_accepts_all_valid_fixtures(self) -> None:
        for name in (
            "minimal-valid.json",
            "all-indicators.json",
            "all-overlays.json",
            "m1-candle-horizontal-line.json",
            "m2-measurement-linear.json",
            "m2-measurement-log.json",
        ):
            with self.subTest(name=name):
                self.assertEqual(validate_scene(load_fixture(name))["version"], 1)

    def test_rejects_nonpositive_logarithmic_prices_and_invalid_measurement_references(self) -> None:
        scene = load_fixture("m2-measurement-log.json")
        scene["overlays"][0]["anchor"]["value"] = 0
        with self.assertRaises(SceneError) as captured:
            validate_scene(scene)
        self.assertEqual(captured.exception.code, "SCENE_SCHEMA_INVALID")

        measurement = load_fixture("m2-measurement-linear.json")
        measurement["overlays"][2]["start"]["timestamp"] += 1
        with self.assertRaises(SceneError) as captured_reference:
            validate_scene(measurement)
        self.assertEqual(captured_reference.exception.code, "INVALID_REFERENCE")

    def test_round_trips_m1_horizontal_line_metadata(self) -> None:
        scene = validate_scene(load_fixture("m1-candle-horizontal-line.json"))
        self.assertEqual(
            scene["overlays"][0]["metadata"],
            {
                "labels": ["m1", "reference-line"],
                "opaque": {
                    "owner": "fixture-consumer",
                    "revision": 1,
                },
            },
        )

    def test_rejects_timestamp_from_horizontal_straight_line_anchor(self) -> None:
        scene = load_fixture("m1-candle-horizontal-line.json")
        scene["overlays"][0]["anchor"]["timestamp"] = scene["data"][0]["timestamp"]

        with self.assertRaises(SceneError) as captured:
            validate_scene(scene)

        self.assertEqual(captured.exception.code, "SCENE_SCHEMA_INVALID")
        self.assertEqual(captured.exception.path, "/overlays/0/anchor")

    def test_rejects_invalid_fixtures_with_typescript_codes(self) -> None:
        expected = {
            "invalid-duplicate-time.json": "INVALID_MARKET_DATA",
            "invalid-ohlc.json": "INVALID_MARKET_DATA",
            "invalid-duplicate-id.json": "DUPLICATE_ID",
            "invalid-indicator-reference.json": "INVALID_REFERENCE",
            "invalid-overlay-anchor.json": "SCENE_SCHEMA_INVALID",
            "invalid-overlay-code.json": "SCENE_SCHEMA_INVALID",
        }
        for name, code in expected.items():
            with self.subTest(name=name):
                with self.assertRaises(SceneError) as captured:
                    validate_scene(load_fixture(name))
                self.assertEqual(captured.exception.code, code)

    def test_accepts_open_below_reported_low(self) -> None:
        scene = load_fixture("minimal-valid.json")
        scene["data"][0]["open"] = scene["data"][0]["low"] - 1

        validated = validate_scene(scene)

        self.assertEqual(validated["data"][0]["open"], scene["data"][0]["open"])

    def test_accepts_open_above_reported_high(self) -> None:
        scene = load_fixture("minimal-valid.json")
        scene["data"][0]["open"] = scene["data"][0]["high"] + 1

        validated = validate_scene(scene)

        self.assertEqual(validated["data"][0]["open"], scene["data"][0]["open"])

    def test_rejects_non_finite_and_unsafe_numbers(self) -> None:
        scene = load_fixture("minimal-valid.json")
        scene["metadata"]["unsafe"] = 9_007_199_254_740_992
        with self.assertRaises(SceneError) as captured:
            validate_scene(scene)
        self.assertEqual(captured.exception.code, "SCENE_SCHEMA_INVALID")


if __name__ == "__main__":
    unittest.main()
