from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from importlib.resources import files
from typing import Any, Mapping

import rfc8785
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from .validation import validate_scene, validate_time_series_scene


@dataclass(frozen=True)
class DrawingDocumentIssue:
    code: str
    path: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"code": self.code, "path": self.path, "message": self.message}


class DrawingDocumentError(ValueError):
    def __init__(
        self,
        code: str,
        path: str,
        message: str,
        issues: list[DrawingDocumentIssue] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.path = path
        self.message = message
        self.issues = tuple(
            issues or [DrawingDocumentIssue(code, path, message)]
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "path": self.path,
            "message": self.message,
            "issues": [item.to_dict() for item in self.issues],
        }


@dataclass(frozen=True)
class DrawableWorkspaceIssue:
    code: str
    path: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"code": self.code, "path": self.path, "message": self.message}


class DrawableWorkspaceError(ValueError):
    def __init__(
        self,
        code: str,
        path: str,
        message: str,
        issues: list[DrawableWorkspaceIssue] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.path = path
        self.message = message
        self.issues = tuple(
            issues or [DrawableWorkspaceIssue(code, path, message)]
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "path": self.path,
            "message": self.message,
            "issues": [item.to_dict() for item in self.issues],
        }


def _load_schemas() -> tuple[
    dict[str, Any],
    dict[str, Any],
    Registry[Any],
]:
    schema_directory = files("baron_kline").joinpath("schemas")
    schemas: list[dict[str, Any]] = []
    for resource in sorted(schema_directory.iterdir(), key=lambda item: item.name):
        if resource.name.endswith(".json"):
            schemas.append(json.loads(resource.read_text(encoding="utf-8")))
    registry: Registry[Any] = Registry()
    for schema in schemas:
        registry = registry.with_resource(
            schema["$id"],
            Resource.from_contents(schema),
        )
    drawing_root = next(
        schema for schema in schemas
        if schema["$id"].endswith("/drawing-document.schema.json")
    )
    workspace_root = next(
        schema for schema in schemas
        if schema["$id"].endswith("/drawable-workspace.schema.json")
    )
    return drawing_root, workspace_root, registry


_DRAWING_ROOT_SCHEMA, _WORKSPACE_ROOT_SCHEMA, _REGISTRY = _load_schemas()
_DRAWING_VALIDATOR = Draft202012Validator(
    _DRAWING_ROOT_SCHEMA,
    registry=_REGISTRY,
)
_WORKSPACE_VALIDATOR = Draft202012Validator(
    _WORKSPACE_ROOT_SCHEMA,
    registry=_REGISTRY,
)


def _as_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return copy.deepcopy(dict(value))
    if hasattr(value, "to_dict") and callable(value.to_dict):
        return copy.deepcopy(value.to_dict())
    raise TypeError("Expected a mapping or a model with to_dict().")


def _pointer_token(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _normalize_instance_path(error: Any) -> str:
    raw_path = error.json_path or "/"
    instance_path = re.sub(r"\[(\d+)\]", r"/\1", raw_path)
    instance_path = instance_path.replace(".", "/")
    if instance_path.startswith("$"):
        instance_path = instance_path[1:]
    if not instance_path.startswith("/"):
        instance_path = f"/{instance_path}"
    if instance_path == "":
        instance_path = "/"
    return instance_path


def _structural_path(error: Any) -> str:
    instance_path = _normalize_instance_path(error)
    message = error.message
    if (
        error.validator == "additionalProperties"
        and message.startswith("Additional properties are not allowed (")
    ):
        raw = message.split("(")[1].split(")")[0]
        name = raw.split("'")[1] if "'" in raw else raw.strip()
        return (
            f"{instance_path}/{_pointer_token(name)}"
            if instance_path != "/"
            else f"/{_pointer_token(name)}"
        )
    if (
        error.validator == "required"
        and message.startswith("'")
        and "is a required property" in message
    ):
        name = message.split("'")[1]
        return (
            f"{instance_path}/{_pointer_token(name)}"
            if instance_path != "/"
            else f"/{_pointer_token(name)}"
        )
    return instance_path


def _structural_issues(
    validator: Draft202012Validator,
    value: Any,
    code: str,
) -> list[DrawingDocumentIssue]:
    issues: list[DrawingDocumentIssue] = []
    for error in validator.iter_errors(value):
        if error.parent is not None:
            continue
        if (
            error.validator == "additionalProperties"
            and error.message.startswith("Additional properties are not allowed (")
        ):
            base = _normalize_instance_path(error)
            names = re.findall(r"'([^']+)'", error.message)
            for name in names:
                path = (
                    f"{base}/{_pointer_token(name)}"
                    if base not in ("", "/")
                    else f"/{_pointer_token(name)}"
                )
                issues.append(
                    DrawingDocumentIssue(
                        code=code,
                        path=path,
                        message="must NOT have additional properties",
                    )
                )
            continue
        issues.append(
            DrawingDocumentIssue(
                code=code,
                path=_structural_path(error),
                message=_structural_message(error),
            )
        )
    issues.sort(
        key=lambda item: (
            1 if item.message == "must match exactly one schema in oneOf" else 0,
            item.path,
        )
    )
    return issues


def _structural_message(error: Any) -> str:
    validator = error.validator
    message = error.message
    value = error.validator_value
    if validator == "additionalProperties":
        return "must NOT have additional properties"
    if validator == "required":
        name = message.split("'")[1]
        return f"must have required property '{name}'"
    if validator == "oneOf":
        return "must match exactly one schema in oneOf"
    if validator == "enum":
        return "must be equal to one of the allowed values"
    if validator == "const":
        return "must be equal to constant"
    if validator == "type":
        if isinstance(value, str):
            return f"must be {value}"
        if isinstance(value, (list, tuple)):
            return f"must be {', '.join(value)}"
    if validator == "minItems":
        return f"must NOT have fewer than {value} items"
    if validator == "maxItems":
        return f"must NOT have more than {value} items"
    if validator == "minLength":
        return f"must NOT have fewer than {value} characters"
    if validator == "maxLength":
        return f"must NOT have more than {value} characters"
    if validator == "minimum":
        return f"must be >= {value}"
    if validator == "maximum":
        return f"must be <= {value}"
    if validator == "pattern":
        return f"must match pattern \"{value}\""
    return message


def normalize_decimal_value(value: float, precision: int) -> float:
    if not math.isfinite(value):
        raise ValueError("Decimal value must be finite.")
    if not isinstance(precision, int) or isinstance(precision, bool) or precision < 0 or precision > 16:
        raise ValueError("Precision must be an integer from 0 through 16.")
    decimal = Decimal(str(value))
    quantum = Decimal(1).scaleb(-precision)
    try:
        rounded = decimal.quantize(quantum, rounding=ROUND_HALF_UP)
    except InvalidOperation as error:
        raise ValueError("Normalized decimal value is not finite.") from error
    result = float(rounded)
    if result == 0:
        result = 0.0
    if not math.isfinite(result):
        raise ValueError("Normalized decimal value is not finite.")
    return result


def _is_negative_zero(value: float) -> bool:
    return value == 0 and math.copysign(1.0, value) < 0


def _sort_json(value: Any) -> Any:
    if isinstance(value, list):
        return [_sort_json(item) for item in value]
    if isinstance(value, dict):
        return {
            key: _sort_json(value[key])
            for key in sorted(value)
        }
    return value


def _validate_value_axes(
    document: dict[str, Any],
    issues: list[DrawingDocumentIssue],
) -> None:
    axes = document["coordinateSystem"]["valueAxes"]
    for index, axis in enumerate(axes):
        path = f"/coordinateSystem/valueAxes/{index}"
        if axis["yAxisRole"] != "primary":
            issues.append(
                DrawingDocumentIssue(
                    "DRAWING_TARGET_INVALID",
                    f"{path}/yAxisRole",
                    "v1 Drawing value axes only allow the primary role.",
                )
            )
        if index > 0:
            previous = axes[index - 1]
            if (
                previous["paneRole"] > axis["paneRole"]
                or (
                    previous["paneRole"] == axis["paneRole"]
                    and previous["yAxisRole"] >= axis["yAxisRole"]
                )
            ):
                issues.append(
                    DrawingDocumentIssue(
                        "DRAWING_DOCUMENT_SEMANTIC_INVALID",
                        path,
                        "valueAxes must be lexically ascending by paneRole and yAxisRole without duplicates.",
                    )
                )


def _drawing_geometry_values(
    drawing: dict[str, Any],
    path: str,
) -> list[tuple[float, str]]:
    result: list[tuple[float, str]] = []
    drawing_type = drawing["type"]
    geometry = drawing["geometry"]

    def add(value: float, value_path: str) -> None:
        result.append((value, value_path))

    if drawing_type in ("horizontalStraightLine", "priceLine", "simpleTag"):
        add(geometry["value"], f"{path}/geometry/value")
    elif drawing_type in ("horizontalRayLine", "horizontalSegment"):
        add(geometry["value"], f"{path}/geometry/value")
    elif drawing_type in ("verticalRayLine", "verticalSegment"):
        add(geometry["startValue"], f"{path}/geometry/startValue")
        add(geometry["endValue"], f"{path}/geometry/endValue")
    elif drawing_type in (
        "rayLine",
        "segment",
        "straightLine",
        "fibonacciLine",
        "priceChannelLine",
        "parallelStraightLine",
        "brush",
    ):
        for index, point in enumerate(geometry["points"]):
            add(point["value"], f"{path}/geometry/points/{index}/value")
    elif drawing_type in (
        "simpleAnnotation",
        "callout",
        "text",
        "crossLine",
    ):
        add(geometry["point"]["value"], f"{path}/geometry/point/value")
    elif drawing_type in ("rectangle", "arrow", "priceMeasurement"):
        add(geometry["start"]["value"], f"{path}/geometry/start/value")
        add(geometry["end"]["value"], f"{path}/geometry/end/value")
    return result


def _validate_drawing(
    document: dict[str, Any],
    drawing: dict[str, Any],
    index: int,
    issues: list[DrawingDocumentIssue],
) -> None:
    path = f"/drawings/{index}"
    axis = next(
        (
            candidate for candidate in document["coordinateSystem"]["valueAxes"]
            if candidate["paneRole"] == drawing["target"]["paneRole"]
            and candidate["yAxisRole"] == drawing["target"]["yAxisRole"]
        ),
        None,
    )
    if axis is None:
        issues.append(
            DrawingDocumentIssue(
                "DRAWING_TARGET_INVALID",
                f"{path}/target",
                "Drawing target must exactly match one coordinateSystem.valueAxes entry.",
            )
        )
        return
    if drawing["target"]["yAxisRole"] != "primary":
        issues.append(
            DrawingDocumentIssue(
                "DRAWING_TARGET_INVALID",
                f"{path}/target/yAxisRole",
                "v1 Drawing targets only allow the primary y-axis role.",
            )
        )
    precision = axis["valuePrecision"]
    for value, value_path in _drawing_geometry_values(drawing, path):
        try:
            normalized = normalize_decimal_value(value, precision)
        except ValueError as error:
            issues.append(
                DrawingDocumentIssue(
                    "DRAWING_GEOMETRY_INVALID",
                    value_path,
                    str(error),
                )
            )
            continue
        if normalized != value or _is_negative_zero(value):
            issues.append(
                DrawingDocumentIssue(
                    "DRAWING_GEOMETRY_INVALID",
                    value_path,
                    f"Value must already be normalized to precision {precision}.",
                )
            )


def _drawing_semantic_issues(
    document: dict[str, Any],
) -> list[DrawingDocumentIssue]:
    issues: list[DrawingDocumentIssue] = []
    _validate_value_axes(document, issues)
    seen_ids: set[str] = set()
    for index, drawing in enumerate(document["drawings"]):
        if drawing["id"] in seen_ids:
            issues.append(
                DrawingDocumentIssue(
                    "DRAWING_DUPLICATE_ID",
                    f"/drawings/{index}/id",
                    f"Duplicate drawing ID: {drawing['id']}.",
                )
            )
        seen_ids.add(drawing["id"])
        _validate_drawing(document, drawing, index, issues)
    return issues


def validate_drawing_document(value: Any) -> dict[str, Any]:
    document = _as_mapping(value)
    issues = _structural_issues(
        _DRAWING_VALIDATOR,
        document,
        "DRAWING_DOCUMENT_SCHEMA_INVALID",
    )
    if issues:
        first = issues[0]
        raise DrawingDocumentError(
            first.code,
            first.path,
            first.message,
            list(issues),
        )
    semantic_issues = _drawing_semantic_issues(document)
    if semantic_issues:
        first = semantic_issues[0]
        raise DrawingDocumentError(
            first.code,
            first.path,
            first.message,
            list(semantic_issues),
        )
    return _sort_json(document)


def _same_axes(
    left: list[dict[str, Any]],
    right: list[dict[str, Any]],
) -> bool:
    if len(left) != len(right):
        return False
    return all(
        (
            left_item["paneRole"] == right_item["paneRole"]
            and left_item["yAxisRole"] == right_item["yAxisRole"]
            and left_item["valuePrecision"] == right_item["valuePrecision"]
        )
        for left_item, right_item in zip(left, right)
    )


def _chart_target_issues(
    scene: dict[str, Any],
    drawings: dict[str, Any],
    issues: list[DrawableWorkspaceIssue],
) -> None:
    indicators = [
        indicator
        for pane in scene["panes"]
        for indicator in pane["indicators"]
    ]
    for index, drawing in enumerate(drawings["drawings"]):
        path = f"/drawings/{index}/target"
        target = drawing["target"]
        if target["yAxisRole"] != "primary":
            issues.append(
                DrawableWorkspaceIssue(
                    "DRAWING_TARGET_INVALID",
                    f"{path}/yAxisRole",
                    "v1 Workspace drawings only bind the primary y-axis role.",
                )
            )
            continue
        if target["paneRole"] == "candle":
            expected = scene["symbol"]["pricePrecision"]
            axis = next(
                (
                    candidate for candidate in drawings["coordinateSystem"]["valueAxes"]
                    if candidate["paneRole"] == "candle"
                    and candidate["yAxisRole"] == "primary"
                ),
                None,
            )
            if axis is None or axis["valuePrecision"] != expected:
                issues.append(
                    DrawableWorkspaceIssue(
                        "DRAWING_TARGET_INVALID",
                        path,
                        "Candle target precision must equal symbol.pricePrecision.",
                    )
                )
            continue
        if target["paneRole"].startswith("indicator:"):
            indicator_id = target["paneRole"][len("indicator:"):]
            matches = [
                indicator for indicator in indicators
                if indicator["id"] == indicator_id
            ]
            if len(matches) != 1:
                issues.append(
                    DrawableWorkspaceIssue(
                        "DRAWING_TARGET_INVALID",
                        path,
                        f"Indicator target must resolve to exactly one SceneIndicator: {indicator_id}.",
                    )
                )
                continue
            indicator = matches[0]
            pane = next(
                (candidate for candidate in scene["panes"] if candidate["id"] == indicator["paneId"]),
                None,
            )
            primary_axis = (
                next(
                    (axis for axis in pane["yAxes"] if axis["role"] == "primary"),
                    None,
                )
                if pane is not None
                else None
            )
            if primary_axis is None or indicator["yAxisId"] != primary_axis["id"]:
                issues.append(
                    DrawableWorkspaceIssue(
                        "DRAWING_TARGET_INVALID",
                        path,
                        "Indicator target must bind the primary axis of its owning Pane.",
                    )
                )
                continue
            axis = next(
                (
                    candidate for candidate in drawings["coordinateSystem"]["valueAxes"]
                    if candidate["paneRole"] == target["paneRole"]
                    and candidate["yAxisRole"] == "primary"
                ),
                None,
            )
            if axis is None or axis["valuePrecision"] != indicator["precision"]:
                issues.append(
                    DrawableWorkspaceIssue(
                        "DRAWING_TARGET_INVALID",
                        path,
                        "Indicator target precision must equal the indicator precision.",
                    )
                )
            continue
        issues.append(
            DrawableWorkspaceIssue(
                "DRAWABLE_SCENE_KIND_UNSUPPORTED",
                f"{path}/paneRole",
                        f"KLine Scene cannot interpret pane role: {target['paneRole']}.",
            )
        )


def _time_series_target_issues(
    scene: dict[str, Any],
    drawings: dict[str, Any],
    issues: list[DrawableWorkspaceIssue],
) -> None:
    shared_precision = scene["series"][0]["precision"]
    axis = next(
        (
            candidate for candidate in drawings["coordinateSystem"]["valueAxes"]
            if candidate["paneRole"] == "time-series"
            and candidate["yAxisRole"] == "primary"
        ),
        None,
    )
    if axis is None or axis["valuePrecision"] != shared_precision:
        issues.append(
            DrawableWorkspaceIssue(
                "DRAWING_TARGET_INVALID",
                "/binding/valueAxes",
                "TimeSeries primary binding precision must equal the shared series precision.",
            )
        )
    for index, drawing in enumerate(drawings["drawings"]):
        target = drawing["target"]
        if (
            target["paneRole"] != "time-series"
            or target["yAxisRole"] != "primary"
        ):
            issues.append(
                DrawableWorkspaceIssue(
                    "DRAWING_TARGET_INVALID",
                    f"/drawings/{index}/target",
                    "TimeSeries drawings must target time-series / primary.",
                )
            )


def _workspace_semantic_issues(
    workspace: dict[str, Any],
) -> list[DrawableWorkspaceIssue]:
    issues: list[DrawableWorkspaceIssue] = []
    binding = workspace["binding"]
    drawings = workspace["drawings"]
    if binding["scopeKey"] != drawings["scopeKey"]:
        issues.append(
            DrawableWorkspaceIssue(
                "DRAWABLE_WORKSPACE_BINDING_MISMATCH",
                "/binding/scopeKey",
                "Workspace binding scopeKey must equal the DrawingDocument scopeKey.",
            )
        )
    if binding["timezone"] != drawings["coordinateSystem"]["timezone"]:
        issues.append(
            DrawableWorkspaceIssue(
                "DRAWABLE_WORKSPACE_BINDING_MISMATCH",
                "/binding/timezone",
                "Workspace binding timezone must equal the DrawingDocument timezone.",
            )
        )
    if not _same_axes(
        binding["valueAxes"],
        drawings["coordinateSystem"]["valueAxes"],
    ):
        issues.append(
            DrawableWorkspaceIssue(
                "DRAWABLE_WORKSPACE_BINDING_MISMATCH",
                "/binding/valueAxes",
                "Workspace binding valueAxes must exactly equal the DrawingDocument valueAxes.",
            )
        )
    scene = workspace["scene"]
    if scene["kind"] == "chart":
        document = scene["document"]
        if document["chart"]["timezone"] != binding["timezone"]:
            issues.append(
                DrawableWorkspaceIssue(
                    "DRAWABLE_WORKSPACE_BINDING_MISMATCH",
                    "/scene/document/chart/timezone",
                    "Chart Scene timezone must equal the Workspace binding timezone.",
                )
            )
        if document["overlays"]:
            issues.append(
                DrawableWorkspaceIssue(
                    "DRAWABLE_WORKSPACE_DOUBLE_AUTHORITY",
                    "/scene/document/overlays",
                    "Workspace chart Scenes must not carry legacy overlays.",
                )
            )
        _chart_target_issues(document, drawings, issues)
    elif scene["kind"] == "time-series":
        document = scene["document"]
        if document["chart"]["timezone"] != binding["timezone"]:
            issues.append(
                DrawableWorkspaceIssue(
                    "DRAWABLE_WORKSPACE_BINDING_MISMATCH",
                    "/scene/document/chart/timezone",
                    "TimeSeries Scene timezone must equal the Workspace binding timezone.",
                )
            )
        _time_series_target_issues(document, drawings, issues)
    else:
        issues.append(
            DrawableWorkspaceIssue(
                "DRAWABLE_SCENE_KIND_UNSUPPORTED",
                "/scene/kind",
                f"Unsupported Workspace scene kind: {scene.get('kind')}.",
            )
        )
    return issues


def validate_drawable_workspace(value: Any) -> dict[str, Any]:
    workspace = _as_mapping(value)
    issues = _structural_issues(
        _WORKSPACE_VALIDATOR,
        workspace,
        "DRAWABLE_WORKSPACE_SCHEMA_INVALID",
    )
    if issues:
        first = issues[0]
        raise DrawableWorkspaceError(
            first.code,
            first.path,
            first.message,
            list(issues),
        )
    scene = workspace["scene"]
    if scene["kind"] == "chart":
        workspace["scene"]["document"] = validate_scene(scene["document"])
    else:
        workspace["scene"]["document"] = validate_time_series_scene(
            scene["document"]
        )
    workspace["drawings"] = validate_drawing_document(workspace["drawings"])
    semantic_issues = _workspace_semantic_issues(workspace)
    if semantic_issues:
        first = semantic_issues[0]
        raise DrawableWorkspaceError(
            first.code,
            first.path,
            first.message,
            list(semantic_issues),
        )
    return _sort_json(workspace)


def canonical_drawing_document_bytes(value: Any) -> bytes:
    return rfc8785.dumps(validate_drawing_document(value))


def canonical_drawing_document_json(value: Any) -> str:
    return canonical_drawing_document_bytes(value).decode("utf-8")


def hash_canonical_drawing_document(value: Any) -> str:
    return hashlib.sha256(
        canonical_drawing_document_bytes(value)
    ).hexdigest()


def canonical_drawable_workspace_bytes(value: Any) -> bytes:
    return rfc8785.dumps(validate_drawable_workspace(value))


def canonical_drawable_workspace_json(value: Any) -> str:
    return canonical_drawable_workspace_bytes(value).decode("utf-8")


def hash_canonical_drawable_workspace(value: Any) -> str:
    return hashlib.sha256(
        canonical_drawable_workspace_bytes(value)
    ).hexdigest()
