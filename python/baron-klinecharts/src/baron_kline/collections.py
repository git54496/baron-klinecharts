from __future__ import annotations

import copy
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .models import ChartScene


class OverlayCollection:
    def __init__(self, scene: ChartScene) -> None:
        self._scene = scene

    def list(self) -> list[dict[str, Any]]:
        return copy.deepcopy(self._scene._document["overlays"])

    def get(self, item_id: str) -> dict[str, Any]:
        for item in self._scene._document["overlays"]:
            if item["id"] == item_id:
                return copy.deepcopy(item)
        raise KeyError(f"Overlay not found: {item_id}")

    def add(self, item: dict[str, Any]) -> None:
        candidate = self._scene.to_dict()
        if any(current["id"] == item["id"] for current in candidate["overlays"]):
            raise KeyError(f"Overlay already exists: {item['id']}")
        candidate["overlays"].append(copy.deepcopy(item))
        self._scene._replace_document(candidate)

    def replace(self, item_id: str, item: dict[str, Any]) -> None:
        if item["id"] != item_id:
            raise ValueError("Replacement Overlay id must match the requested id.")
        candidate = self._scene.to_dict()
        for index, current in enumerate(candidate["overlays"]):
            if current["id"] == item_id:
                candidate["overlays"][index] = copy.deepcopy(item)
                self._scene._replace_document(candidate)
                return
        raise KeyError(f"Overlay not found: {item_id}")

    def remove(self, item_id: str) -> None:
        candidate = self._scene.to_dict()
        remaining = [
            item for item in candidate["overlays"]
            if item["id"] != item_id
        ]
        if len(remaining) == len(candidate["overlays"]):
            raise KeyError(f"Overlay not found: {item_id}")
        candidate["overlays"] = remaining
        self._scene._replace_document(candidate)


class IndicatorCollection:
    def __init__(self, scene: ChartScene) -> None:
        self._scene = scene

    def list(self) -> list[dict[str, Any]]:
        return copy.deepcopy([
            indicator
            for pane in self._scene._document["panes"]
            for indicator in pane["indicators"]
        ])

    def get(self, item_id: str) -> dict[str, Any]:
        for item in self.list():
            if item["id"] == item_id:
                return item
        raise KeyError(f"Indicator not found: {item_id}")

    def add(self, item: dict[str, Any]) -> None:
        candidate = self._scene.to_dict()
        if any(
            current["id"] == item["id"]
            for pane in candidate["panes"]
            for current in pane["indicators"]
        ):
            raise KeyError(f"Indicator already exists: {item['id']}")
        for pane in candidate["panes"]:
            if pane["id"] == item["paneId"]:
                pane["indicators"].append(copy.deepcopy(item))
                self._scene._replace_document(candidate)
                return
        raise KeyError(f"Pane not found: {item['paneId']}")

    def replace(self, item_id: str, item: dict[str, Any]) -> None:
        if item["id"] != item_id:
            raise ValueError("Replacement Indicator id must match the requested id.")
        candidate = self._scene.to_dict()
        for pane in candidate["panes"]:
            for index, current in enumerate(pane["indicators"]):
                if current["id"] == item_id:
                    if item["paneId"] != pane["id"]:
                        raise ValueError("Replacement Indicator cannot move between Panes.")
                    pane["indicators"][index] = copy.deepcopy(item)
                    self._scene._replace_document(candidate)
                    return
        raise KeyError(f"Indicator not found: {item_id}")

    def remove(self, item_id: str) -> None:
        candidate = self._scene.to_dict()
        for pane in candidate["panes"]:
            for index, current in enumerate(pane["indicators"]):
                if current["id"] == item_id:
                    pane["indicators"].pop(index)
                    self._scene._replace_document(candidate)
                    return
        raise KeyError(f"Indicator not found: {item_id}")
