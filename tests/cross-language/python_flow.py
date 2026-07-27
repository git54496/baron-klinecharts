from __future__ import annotations

import argparse
from pathlib import Path

from baron_kline import (
    ChartScene,
    canonical_scene_bytes,
    hash_canonical_scene,
    load_scene,
    render_scene_html,
    render_scene_png,
    save_scene,
)

from json import load


parser = argparse.ArgumentParser()
subparsers = parser.add_subparsers(dest="command", required=True)

create = subparsers.add_parser("create")
create.add_argument("fixture")
create.add_argument("output")

roundtrip = subparsers.add_parser("roundtrip")
roundtrip.add_argument("input")
roundtrip.add_argument("output")

render = subparsers.add_parser("render")
render.add_argument("input")
render.add_argument("html")
render.add_argument("png")

canonical = subparsers.add_parser("canonical")
canonical.add_argument("input")
canonical.add_argument("output")

hash_command = subparsers.add_parser("hash")
hash_command.add_argument("input")

arguments = parser.parse_args()

if arguments.command == "create":
    with Path(arguments.fixture).open("r", encoding="utf-8") as source:
        scene = ChartScene.from_dict(load(source))
    save_scene(scene, arguments.output)
elif arguments.command == "roundtrip":
    save_scene(load_scene(arguments.input), arguments.output)
elif arguments.command == "render":
    scene = load_scene(arguments.input)
    render_scene_html(scene, arguments.html)
    render_scene_png(scene, arguments.png)
elif arguments.command == "canonical":
    Path(arguments.output).write_bytes(
        canonical_scene_bytes(load_scene(arguments.input).to_dict())
    )
elif arguments.command == "hash":
    print(hash_canonical_scene(load_scene(arguments.input).to_dict()))
