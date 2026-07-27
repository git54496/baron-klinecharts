from __future__ import annotations

import copy
import unittest

from baron_kline import ChartScene, SceneError

from helpers import load_fixture


class CollectionTests(unittest.TestCase):
    def test_overlay_collection_validates_every_mutation(self) -> None:
        scene = ChartScene.from_dict(load_fixture("minimal-valid.json"))
        overlay = load_fixture("all-overlays.json")["overlays"][0]
        scene.overlays.add(overlay)
        self.assertEqual(scene.overlays.get(overlay["id"])["id"], overlay["id"])
        replacement = copy.deepcopy(overlay)
        replacement["value"] += 1
        scene.overlays.replace(overlay["id"], replacement)
        self.assertEqual(scene.overlays.get(overlay["id"])["value"], replacement["value"])
        invalid = copy.deepcopy(overlay)
        invalid["id"] = "outside-pane"
        invalid["paneId"] = "missing"
        with self.assertRaises(SceneError):
            scene.overlays.add(invalid)
        scene.overlays.remove(overlay["id"])
        self.assertEqual(scene.overlays.list(), [])

    def test_indicator_collection_validates_every_mutation(self) -> None:
        scene = ChartScene.from_dict(load_fixture("minimal-valid.json"))
        indicator_scene = load_fixture("all-indicators.json")
        indicator = next(
            item
            for pane in indicator_scene["panes"]
            for item in pane["indicators"]
        )
        indicator["paneId"] = scene.panes[0]["id"]
        indicator["yAxisId"] = scene.panes[0]["yAxes"][0]["id"]
        scene.indicators.add(indicator)
        replacement = copy.deepcopy(indicator)
        replacement["precision"] += 1
        scene.indicators.replace(indicator["id"], replacement)
        self.assertEqual(
            scene.indicators.get(indicator["id"])["precision"],
            replacement["precision"],
        )
        scene.indicators.remove(indicator["id"])
        self.assertEqual(scene.indicators.list(), [])


if __name__ == "__main__":
    unittest.main()
