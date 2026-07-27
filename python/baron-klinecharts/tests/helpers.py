from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPOSITORY = Path(__file__).resolve().parents[3]
FIXTURES = REPOSITORY / "tests" / "fixtures" / "scenes"


def load_fixture(name: str) -> dict[str, Any]:
    with (FIXTURES / name).open("r", encoding="utf-8") as source:
        return json.load(source)
