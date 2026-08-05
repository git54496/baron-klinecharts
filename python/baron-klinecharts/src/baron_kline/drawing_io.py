from __future__ import annotations

import json
from pathlib import Path

from .drawing_models import (
    DrawableWorkspaceDocument,
    DrawingDocument,
)
from .drawing_validation import (
    canonical_drawable_workspace_bytes,
    canonical_drawing_document_bytes,
)
from .io import write_bytes_atomic


def load_drawing_document(path: str | Path) -> DrawingDocument:
    with Path(path).open("r", encoding="utf-8") as source:
        return DrawingDocument.from_dict(json.load(source))


def save_drawing_document(
    document: DrawingDocument,
    path: str | Path,
    *,
    force: bool = False,
) -> None:
    write_bytes_atomic(
        path,
        canonical_drawing_document_bytes(document),
        force=force,
    )


def load_drawable_workspace(
    path: str | Path,
) -> DrawableWorkspaceDocument:
    with Path(path).open("r", encoding="utf-8") as source:
        return DrawableWorkspaceDocument.from_dict(json.load(source))


def save_drawable_workspace(
    workspace: DrawableWorkspaceDocument,
    path: str | Path,
    *,
    force: bool = False,
) -> None:
    write_bytes_atomic(
        path,
        canonical_drawable_workspace_bytes(workspace),
        force=force,
    )
