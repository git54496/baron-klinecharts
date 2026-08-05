from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Mapping

from .drawing_validation import (
    validate_drawable_workspace,
    validate_drawing_document,
)


@dataclass(frozen=True)
class DrawingDocument:
    """通用画线事实文档；geometry 保持原始 dict 深拷贝，None 不被改写。"""

    schema: str
    version: int
    scopeKey: str
    coordinateSystem: dict[str, Any]
    drawings: tuple[dict[str, Any], ...]
    metadata: dict[str, Any]

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> DrawingDocument:
        validated = validate_drawing_document(value)
        return cls(
            schema=validated["schema"],
            version=validated["version"],
            scopeKey=validated["scopeKey"],
            coordinateSystem=copy.deepcopy(validated["coordinateSystem"]),
            drawings=tuple(
                copy.deepcopy(drawing)
                for drawing in validated["drawings"]
            ),
            metadata=copy.deepcopy(validated["metadata"]),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "version": self.version,
            "scopeKey": self.scopeKey,
            "coordinateSystem": copy.deepcopy(self.coordinateSystem),
            "drawings": copy.deepcopy(list(self.drawings)),
            "metadata": copy.deepcopy(self.metadata),
        }


@dataclass(frozen=True)
class DrawableWorkspaceDocument:
    """显式组合 Scene、DrawingDocument 与坐标绑定的工作区根文档。"""

    schema: str
    version: int
    runtime: dict[str, Any]
    scene: dict[str, Any]
    drawings: DrawingDocument
    binding: dict[str, Any]
    metadata: dict[str, Any]

    @classmethod
    def from_dict(
        cls,
        value: Mapping[str, Any],
    ) -> DrawableWorkspaceDocument:
        validated = validate_drawable_workspace(value)
        return cls(
            schema=validated["schema"],
            version=validated["version"],
            runtime=copy.deepcopy(validated["runtime"]),
            scene=copy.deepcopy(validated["scene"]),
            drawings=DrawingDocument.from_dict(validated["drawings"]),
            binding=copy.deepcopy(validated["binding"]),
            metadata=copy.deepcopy(validated["metadata"]),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "version": self.version,
            "runtime": copy.deepcopy(self.runtime),
            "scene": copy.deepcopy(self.scene),
            "drawings": self.drawings.to_dict(),
            "binding": copy.deepcopy(self.binding),
            "metadata": copy.deepcopy(self.metadata),
        }
