from __future__ import annotations

import copy
from typing import Any

from .drawing_models import DrawingDocument
from .drawing_validation import validate_drawing_document


class DrawingCollection:
    """对 DrawingDocument.drawings 的显式编辑集合，每次变更都重新校验。"""

    def __init__(self, document: DrawingDocument) -> None:
        self._document = document

    def list(self) -> list[dict[str, Any]]:
        return [copy.deepcopy(item) for item in self._document.drawings]

    def get(self, drawing_id: str) -> dict[str, Any]:
        for item in self._document.drawings:
            if item["id"] == drawing_id:
                return copy.deepcopy(item)
        raise KeyError(f"Drawing not found: {drawing_id}")

    def add(self, drawing: dict[str, Any]) -> None:
        candidate = self._document.to_dict()
        if any(
            current["id"] == drawing["id"]
            for current in candidate["drawings"]
        ):
            raise KeyError(f"Drawing already exists: {drawing['id']}")
        candidate["drawings"].append(copy.deepcopy(drawing))
        self._replace(candidate)

    def replace(self, drawing_id: str, drawing: dict[str, Any]) -> None:
        if drawing["id"] != drawing_id:
            raise ValueError(
                "Replacement Drawing id must match the requested id."
            )
        candidate = self._document.to_dict()
        for index, current in enumerate(candidate["drawings"]):
            if current["id"] == drawing_id:
                candidate["drawings"][index] = copy.deepcopy(drawing)
                self._replace(candidate)
                return
        raise KeyError(f"Drawing not found: {drawing_id}")

    def remove(self, drawing_id: str) -> None:
        candidate = self._document.to_dict()
        remaining = [
            item for item in candidate["drawings"]
            if item["id"] != drawing_id
        ]
        if len(remaining) == len(candidate["drawings"]):
            raise KeyError(f"Drawing not found: {drawing_id}")
        candidate["drawings"] = remaining
        self._replace(candidate)

    def _replace(self, candidate: dict[str, Any]) -> None:
        validated = validate_drawing_document(candidate)
        self._document = DrawingDocument.from_dict(validated)
