from __future__ import annotations

import argparse
import json
from pathlib import Path

from baron_kline import (
    DrawableWorkspaceError,
    DrawingDocumentError,
    canonical_drawable_workspace_bytes,
    canonical_drawing_document_bytes,
    hash_canonical_drawable_workspace,
    hash_canonical_drawing_document,
    load_drawable_workspace,
    load_drawing_document,
    render_drawable_workspace_html,
    render_drawable_workspace_png,
    save_drawable_workspace,
    save_drawing_document,
)


parser = argparse.ArgumentParser()
parser.add_argument(
    "command",
    choices=(
        "canonical",
        "hash",
        "roundtrip",
        "validate-error",
        "render-html",
        "render-png",
    ),
)
parser.add_argument(
    "kind",
    choices=("drawing", "workspace"),
)
parser.add_argument("input")
parser.add_argument("output", nargs="?")
arguments = parser.parse_args()

if arguments.command == "validate-error":
    try:
        if arguments.kind == "drawing":
            load_drawing_document(arguments.input)
        else:
            load_drawable_workspace(arguments.input)
    except (DrawingDocumentError, DrawableWorkspaceError) as error:
        print(json.dumps({
            "code": error.code,
            "path": error.path,
            "issues": [issue.to_dict() for issue in error.issues],
        }))
    else:
        raise ValueError("validate-error requires an invalid document")
    raise SystemExit(0)

if arguments.command in ("render-html", "render-png"):
    if arguments.kind != "workspace":
        raise ValueError("render commands require a workspace")
    if arguments.output is None:
        raise ValueError(f"{arguments.command} requires output")
    workspace = load_drawable_workspace(arguments.input)
    if arguments.command == "render-html":
        render_drawable_workspace_html(workspace, arguments.output)
    else:
        render_drawable_workspace_png(workspace, arguments.output)
    raise SystemExit(0)

if arguments.kind == "drawing":
    document = load_drawing_document(arguments.input)
    if arguments.command == "canonical":
        if arguments.output is None:
            raise ValueError("canonical requires output")
        Path(arguments.output).write_bytes(
            canonical_drawing_document_bytes(document)
        )
    elif arguments.command == "roundtrip":
        if arguments.output is None:
            raise ValueError("roundtrip requires output")
        save_drawing_document(document, arguments.output)
    else:
        print(hash_canonical_drawing_document(document))
else:
    workspace = load_drawable_workspace(arguments.input)
    if arguments.command == "canonical":
        if arguments.output is None:
            raise ValueError("canonical requires output")
        Path(arguments.output).write_bytes(
            canonical_drawable_workspace_bytes(workspace)
        )
    elif arguments.command == "roundtrip":
        if arguments.output is None:
            raise ValueError("roundtrip requires output")
        save_drawable_workspace(workspace, arguments.output)
    else:
        print(hash_canonical_drawable_workspace(workspace))
