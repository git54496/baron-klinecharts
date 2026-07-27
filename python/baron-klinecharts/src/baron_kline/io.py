from __future__ import annotations

import json
import os
import secrets
from pathlib import Path

from .models import ChartScene
from .validation import canonical_scene_bytes


def load_scene(path: str | Path) -> ChartScene:
    with Path(path).open("r", encoding="utf-8") as source:
        return ChartScene.from_dict(json.load(source))


def write_bytes_atomic(
    path: str | Path,
    content: bytes,
    *,
    force: bool = False,
) -> None:
    target = Path(path).resolve()
    if target.exists() and not force:
        raise FileExistsError(f"Output already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.parent / (
        f".{target.name}.{os.getpid()}.{secrets.token_hex(8)}.tmp"
    )
    try:
        with temporary.open("xb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        if target.exists() and not force:
            raise FileExistsError(f"Output was created concurrently: {target}")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def save_scene(
    scene: ChartScene,
    path: str | Path,
    *,
    force: bool = False,
) -> None:
    write_bytes_atomic(
        path,
        canonical_scene_bytes(scene.to_dict()),
        force=force,
    )
