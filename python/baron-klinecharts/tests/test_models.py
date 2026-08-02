from __future__ import annotations

import unittest

from baron_kline import ChartScene

from helpers import load_fixture


class ModelTests(unittest.TestCase):
    def test_scene_round_trip_preserves_missing_volume(self) -> None:
        source = load_fixture("minimal-valid.json")
        del source["data"][0]["volume"]
        scene = ChartScene.from_dict(source)
        self.assertNotIn("volume", scene.data[0].to_dict())
        self.assertEqual(scene.to_dict()["runtime"]["engineVersion"], "10.0.0")

    def test_models_are_detached_from_input_and_output(self) -> None:
        source = load_fixture("minimal-valid.json")
        scene = ChartScene.from_dict(source)
        source["symbol"]["ticker"] = "MUTATED"
        exported = scene.to_dict()
        exported["symbol"]["ticker"] = "ALSO-MUTATED"
        self.assertEqual(scene.symbol["ticker"], "000001.SZ")

    def test_m2_measurement_round_trip_preserves_only_data_coordinates(self) -> None:
        source = load_fixture("m2-measurement-linear.json")
        scene = ChartScene.from_dict(source)
        measurement = scene.to_dict()["overlays"][2]
        self.assertEqual(set(measurement), {
            "id", "type", "paneId", "visible", "locked", "zLevel", "mode",
            "start", "end", "styles", "metadata",
        })
        self.assertEqual(
            measurement["end"]["value"] - measurement["start"]["value"],
            30,
        )


if __name__ == "__main__":
    unittest.main()
