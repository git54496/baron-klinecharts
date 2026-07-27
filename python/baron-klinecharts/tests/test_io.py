from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from baron_kline import ChartScene, SceneData, load_scene, save_scene

from helpers import load_fixture


COLUMNS = {
    "timestamp": "ts",
    "open": "o",
    "high": "h",
    "low": "l",
    "close": "c",
    "volume": "v",
}


class FakeDataFrame:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def to_dict(self, *, orient: str) -> list[dict[str, object]]:
        if orient != "records":
            raise AssertionError("Unexpected DataFrame orientation.")
        return self.rows


class IoTests(unittest.TestCase):
    def test_rows_require_explicit_mapping(self) -> None:
        rows = [{"ts": 1, "o": 1, "h": 2, "l": 0.5, "c": 1.5, "v": 10}]
        data = SceneData.from_rows(rows, columns=COLUMNS)
        self.assertEqual(data[0].timestamp, 1)
        with self.assertRaises(ValueError):
            SceneData.from_rows(rows, columns={})
        frame = SceneData.from_rows(FakeDataFrame(rows), columns=COLUMNS)
        self.assertEqual(frame.to_list(), data.to_list())

    def test_csv_and_atomic_json_io(self) -> None:
        with tempfile.TemporaryDirectory() as raw_directory:
            directory = Path(raw_directory)
            csv_path = directory / "bars.csv"
            with csv_path.open("w", encoding="utf-8", newline="") as target:
                writer = csv.DictWriter(target, fieldnames=["ts", "o", "h", "l", "c", "v"])
                writer.writeheader()
                writer.writerow({"ts": 1, "o": 1, "h": 2, "l": 0.5, "c": 1.5, "v": 10})
            self.assertEqual(
                SceneData.from_csv(csv_path, columns=COLUMNS)[0].close,
                1.5,
            )

            scene = ChartScene.from_dict(load_fixture("minimal-valid.json"))
            output = directory / "scene.json"
            save_scene(scene, output)
            with self.assertRaises(FileExistsError):
                save_scene(scene, output)
            save_scene(scene, output, force=True)
            self.assertEqual(load_scene(output).runtime.engine_version, "10.0.0")


if __name__ == "__main__":
    unittest.main()
