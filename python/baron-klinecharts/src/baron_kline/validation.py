from __future__ import annotations

import copy
import hashlib
import json
import math
from importlib.resources import files
from typing import Any

import rfc8785
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from .errors import SceneError, SceneIssue

SAFE_INTEGER_MAX = 9_007_199_254_740_991

INDICATOR_PARAM_COUNTS = {
    "MA": 4, "EMA": 3, "SMA": 2, "BBI": 4, "VOL": 3, "MACD": 3,
    "BOLL": 2, "KDJ": 3, "RSI": 3, "BIAS": 3, "BRAR": 1, "CCI": 1,
    "DMI": 2, "CR": 5, "PSY": 2, "DMA": 3, "TRIX": 2, "OBV": 1,
    "VR": 2, "WR": 3, "MTM": 2, "EMV": 2, "SAR": 3, "AO": 2,
    "ROC": 2, "PVT": 0, "AVP": 0,
}

OVERLAY_BASE_KEYS = {
    "id", "type", "paneId", "groupId", "visible", "locked", "zLevel",
    "mode", "styles", "metadata",
}


def _load_schemas() -> tuple[dict[str, Any], Registry[Any]]:
    schemas: list[dict[str, Any]] = []
    schema_directory = files("baron_kline").joinpath("schemas")
    for resource in sorted(schema_directory.iterdir(), key=lambda item: item.name):
        if resource.name.endswith(".json"):
            schemas.append(json.loads(resource.read_text(encoding="utf-8")))
    registry: Registry[Any] = Registry()
    for schema in schemas:
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    root = next(
        schema for schema in schemas
        if schema["$id"].endswith("/chart-scene.schema.json")
    )
    return root, registry


_ROOT_SCHEMA, _REGISTRY = _load_schemas()
_VALIDATOR = Draft202012Validator(_ROOT_SCHEMA, registry=_REGISTRY)


def _pointer(parts: Any) -> str:
    encoded = [
        str(part).replace("~", "~0").replace("/", "~1")
        for part in parts
    ]
    return "/" + "/".join(encoded) if encoded else "/"


def _structural_code(path: str, validator: str) -> str:
    if path.startswith("/data"):
        return "INVALID_MARKET_DATA"
    if "/indicators/" in path and path.endswith("/name") and validator == "enum":
        return "UNKNOWN_INDICATOR"
    if path.startswith("/overlays/") and path.endswith("/type") and validator == "enum":
        return "UNKNOWN_OVERLAY"
    if path.startswith("/runtime"):
        return "ENGINE_VERSION_MISMATCH"
    if path in {"/schema", "/version"}:
        return "SCENE_VERSION_UNSUPPORTED"
    return "SCENE_SCHEMA_INVALID"


def _assert_number_domain(value: Any, path: str = "/") -> None:
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, int):
        if abs(value) > SAFE_INTEGER_MAX:
            raise SceneError(
                "SCENE_SCHEMA_INVALID",
                path,
                "Integer values must be within the shared safe-integer domain.",
            )
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise SceneError(
                "SCENE_SCHEMA_INVALID",
                path,
                "Numeric values must be finite binary64 values.",
            )
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            _assert_number_domain(child, f"{path.rstrip('/')}/{index}")
        return
    if isinstance(value, dict):
        for key, child in value.items():
            encoded = str(key).replace("~", "~0").replace("/", "~1")
            _assert_number_domain(child, f"{path.rstrip('/')}/{encoded}")


def _issue(code: str, path: str, message: str) -> SceneIssue:
    return SceneIssue(code=code, path=path, message=message)


def _unique(values: list[str], path: str, label: str, issues: list[SceneIssue]) -> None:
    seen: set[str] = set()
    for index, value in enumerate(values):
        if value in seen:
            issues.append(_issue(
                "DUPLICATE_ID", f"{path}/{index}", f"Duplicate {label} ID: {value}"
            ))
        seen.add(value)


def _validate_market_data(scene: dict[str, Any], issues: list[SceneIssue]) -> None:
    previous = -math.inf
    for index, bar in enumerate(scene["data"]):
        path = f"/data/{index}"
        timestamp = bar["timestamp"]
        is_safe_timestamp = (
            isinstance(timestamp, (int, float))
            and not isinstance(timestamp, bool)
            and math.isfinite(timestamp)
            and float(timestamp).is_integer()
            and abs(timestamp) <= SAFE_INTEGER_MAX
        )
        if not is_safe_timestamp:
            issues.append(_issue(
                "INVALID_MARKET_DATA", f"{path}/timestamp",
                "Timestamp must be a safe integer.",
            ))
        if timestamp <= previous:
            issues.append(_issue(
                "INVALID_MARKET_DATA", f"{path}/timestamp",
                "Market-data timestamps must be strictly increasing.",
            ))
        previous = timestamp
        if (
            bar["low"] > bar["high"]
            or bar["open"] < bar["low"]
            or bar["open"] > bar["high"]
            or bar["close"] < bar["low"]
            or bar["close"] > bar["high"]
        ):
            issues.append(_issue(
                "INVALID_MARKET_DATA", path,
                "OHLC values must satisfy low <= open/close <= high.",
            ))
    if not any(
        bar["timestamp"] == scene["viewport"]["anchorTimestamp"]
        for bar in scene["data"]
    ):
        issues.append(_issue(
            "INVALID_REFERENCE", "/viewport/anchorTimestamp",
            "Viewport anchorTimestamp must reference an embedded market-data bar.",
        ))


def _validate_indicator(
    indicator: dict[str, Any],
    pane: dict[str, Any],
    index: int,
    issues: list[SceneIssue],
) -> None:
    path = f"/panes/{pane['order']}/indicators/{index}"
    if indicator["paneId"] != pane["id"]:
        issues.append(_issue(
            "INVALID_REFERENCE", f"{path}/paneId",
            "Indicator paneId must match its containing Pane.",
        ))
    if not any(axis["id"] == indicator["yAxisId"] for axis in pane["yAxes"]):
        issues.append(_issue(
            "INVALID_REFERENCE", f"{path}/yAxisId",
            "Indicator yAxisId must reference an axis in its containing Pane.",
        ))
    expected = INDICATOR_PARAM_COUNTS[indicator["name"]]
    if len(indicator["calcParams"]) != expected:
        issues.append(_issue(
            "SCENE_SCHEMA_INVALID", f"{path}/calcParams",
            f"{indicator['name']} requires exactly {expected} calculation parameters.",
        ))


def _validate_panes(scene: dict[str, Any], issues: list[SceneIssue]) -> None:
    panes = scene["panes"]
    _unique([pane["id"] for pane in panes], "/panes", "Pane", issues)
    _unique(
        [axis["id"] for pane in panes for axis in pane["yAxes"]],
        "/panes", "Y-axis", issues,
    )
    _unique(
        [indicator["id"] for pane in panes for indicator in pane["indicators"]],
        "/panes", "Indicator", issues,
    )
    if sum(pane["kind"] == "candle" for pane in panes) != 1:
        issues.append(_issue(
            "INVALID_REFERENCE", "/panes",
            "A Scene must contain exactly one candle Pane.",
        ))
    for pane_index, pane in enumerate(panes):
        path = f"/panes/{pane_index}"
        if pane["order"] != pane_index:
            issues.append(_issue(
                "INVALID_REFERENCE", f"{path}/order",
                "Pane order must match canonical array order.",
            ))
        if pane["height"] < pane["minHeight"]:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/height",
                "Pane height must be >= minHeight.",
            ))
        _unique(
            [axis["id"] for axis in pane["yAxes"]],
            f"{path}/yAxes", "Y-axis", issues,
        )
        primary = [axis for axis in pane["yAxes"] if axis["role"] == "primary"]
        if len(primary) != 1:
            issues.append(_issue(
                "INVALID_REFERENCE", f"{path}/yAxes",
                "Each Pane must contain exactly one primary Y-axis.",
            ))
        for axis_index, axis in enumerate(pane["yAxes"]):
            if axis["topGap"] + axis["bottomGap"] >= 1:
                issues.append(_issue(
                    "SCENE_SCHEMA_INVALID", f"{path}/yAxes/{axis_index}",
                    "Y-axis topGap + bottomGap must be less than 1.",
                ))
        if pane["kind"] == "indicator":
            if not pane["indicators"]:
                issues.append(_issue(
                    "INVALID_REFERENCE", f"{path}/indicators",
                    "Indicator Panes cannot be empty.",
                ))
            primary_id = primary[0]["id"] if primary else None
            if primary_id is not None and not any(
                item["yAxisId"] == primary_id for item in pane["indicators"]
            ):
                issues.append(_issue(
                    "INVALID_REFERENCE", f"{path}/indicators",
                    "An Indicator Pane must contain an Indicator on its primary Y-axis.",
                ))
        for indicator_index, indicator in enumerate(pane["indicators"]):
            _validate_indicator(indicator, pane, indicator_index, issues)


def _require_overlay_keys(
    overlay: dict[str, Any],
    path: str,
    required: list[str],
    issues: list[SceneIssue],
) -> None:
    allowed = OVERLAY_BASE_KEYS | set(required)
    for key in required:
        if key not in overlay:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/{key}",
                f"{overlay['type']} requires {key}.",
            ))
    for key in overlay:
        if key not in allowed:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/{key}",
                f"{overlay['type']} does not allow {key}.",
            ))


def _validate_overlay_shape(
    overlay: dict[str, Any],
    path: str,
    issues: list[SceneIssue],
) -> None:
    overlay_type = overlay["type"]
    if overlay_type == "horizontalStraightLine":
        _require_overlay_keys(overlay, path, ["anchor"], issues)
        if "anchor" not in overlay or "value" not in overlay["anchor"]:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/anchor",
                "A value anchor is required.",
            ))
        elif set(overlay["anchor"]) != {"value"}:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/anchor",
                "horizontalStraightLine anchor must contain only value.",
            ))
    elif overlay_type == "priceLine":
        _require_overlay_keys(overlay, path, ["anchor"], issues)
        if "anchor" not in overlay or "value" not in overlay["anchor"]:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/anchor",
                "A value anchor is required.",
            ))
    elif overlay_type == "verticalStraightLine":
        _require_overlay_keys(overlay, path, ["anchor"], issues)
        if "anchor" not in overlay or "timestamp" not in overlay["anchor"]:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/anchor",
                "A time anchor is required.",
            ))
    elif overlay_type in {"horizontalRayLine", "horizontalSegment"}:
        _require_overlay_keys(
            overlay, path, ["value", "startTimestamp", "endTimestamp"], issues
        )
    elif overlay_type in {"verticalRayLine", "verticalSegment"}:
        _require_overlay_keys(
            overlay, path, ["timestamp", "startValue", "endValue"], issues
        )
    elif overlay_type in {"rayLine", "segment", "straightLine", "fibonacciLine"}:
        _require_overlay_keys(overlay, path, ["points"], issues)
        if len(overlay.get("points", [])) != 2:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/points",
                "Exactly two points are required.",
            ))
    elif overlay_type in {"priceChannelLine", "parallelStraightLine"}:
        _require_overlay_keys(overlay, path, ["points"], issues)
        if len(overlay.get("points", [])) != 3:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/points",
                "Exactly three points are required.",
            ))
    elif overlay_type == "brush":
        _require_overlay_keys(overlay, path, ["points"], issues)
        if len(overlay.get("points", [])) < 2:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/points",
                "Brush requires at least two points.",
            ))
    elif overlay_type == "simpleTag":
        _require_overlay_keys(overlay, path, ["anchor", "text"], issues)
        if "anchor" not in overlay or "value" not in overlay["anchor"]:
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/anchor",
                "A value anchor is required.",
            ))
    elif overlay_type in {"simpleAnnotation", "callout", "text"}:
        _require_overlay_keys(overlay, path, ["point", "text"], issues)
    elif overlay_type in {"rectangle", "arrow"}:
        _require_overlay_keys(overlay, path, ["start", "end"], issues)
    elif overlay_type == "crossLine":
        _require_overlay_keys(overlay, path, ["point"], issues)


def _validate_overlays(scene: dict[str, Any], issues: list[SceneIssue]) -> None:
    overlays = scene["overlays"]
    _unique([overlay["id"] for overlay in overlays], "/overlays", "Overlay", issues)
    pane_ids = {pane["id"] for pane in scene["panes"]}
    for index, overlay in enumerate(overlays):
        path = f"/overlays/{index}"
        if overlay["paneId"] not in pane_ids:
            issues.append(_issue(
                "INVALID_REFERENCE", f"{path}/paneId",
                "Overlay paneId does not exist.",
            ))
        _validate_overlay_shape(overlay, path, issues)


def _sort_json(value: Any) -> Any:
    if isinstance(value, list):
        return [_sort_json(child) for child in value]
    if isinstance(value, dict):
        return {
            key: _sort_json(value[key])
            for key in sorted(value)
        }
    return value


def validate_scene(value: Any) -> dict[str, Any]:
    _assert_number_domain(value)
    errors = list(_VALIDATOR.iter_errors(value))
    if errors:
        issues: list[SceneIssue] = []
        for error in errors:
            path = _pointer(error.absolute_path)
            code = _structural_code(path, error.validator)
            issues.append(_issue(code, path, error.message))
        first = issues[0]
        raise SceneError(first.code, first.path, first.message, issues)
    scene = copy.deepcopy(value)
    semantic_issues: list[SceneIssue] = []
    _validate_market_data(scene, semantic_issues)
    _validate_panes(scene, semantic_issues)
    _validate_overlays(scene, semantic_issues)
    if semantic_issues:
        first = semantic_issues[0]
        raise SceneError(first.code, first.path, first.message, semantic_issues)
    return _sort_json(scene)


def canonical_scene_bytes(value: Any) -> bytes:
    return rfc8785.dumps(validate_scene(value))


def canonical_scene_json(value: Any) -> str:
    return canonical_scene_bytes(value).decode("utf-8")


def hash_canonical_scene(value: Any) -> str:
    return hashlib.sha256(canonical_scene_bytes(value)).hexdigest()
