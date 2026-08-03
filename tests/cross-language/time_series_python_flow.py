from __future__ import annotations

import argparse
import json
from pathlib import Path

from baron_kline import (
    TimeSeriesSceneError,
    canonical_time_series_scene_bytes,
    hash_canonical_time_series_scene,
    load_time_series_scene,
    save_time_series_scene,
)


parser = argparse.ArgumentParser()
parser.add_argument(
    "command",
    choices=("canonical", "hash", "roundtrip", "validate-error"),
)
parser.add_argument("input")
parser.add_argument("output", nargs="?")
arguments = parser.parse_args()
if arguments.command == "validate-error":
    try:
        load_time_series_scene(arguments.input)
    except TimeSeriesSceneError as error:
        print(json.dumps({
            "code": error.code,
            "path": error.path,
            "issues": [issue.to_dict() for issue in error.issues],
        }))
    else:
        raise ValueError("validate-error requires an invalid scene")
    raise SystemExit(0)

scene = load_time_series_scene(arguments.input)

if arguments.command == "canonical":
    if arguments.output is None:
        raise ValueError("canonical requires output")
    Path(arguments.output).write_bytes(
        canonical_time_series_scene_bytes(scene)
    )
elif arguments.command == "roundtrip":
    if arguments.output is None:
        raise ValueError("roundtrip requires output")
    save_time_series_scene(scene, arguments.output)
else:
    print(hash_canonical_time_series_scene(scene))
