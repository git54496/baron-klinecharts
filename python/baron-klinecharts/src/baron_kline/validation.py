from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from importlib.resources import files
from typing import Any

import rfc8785
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from .errors import (
    SceneError,
    SceneIssue,
    TimeSeriesSceneError,
    TimeSeriesSceneIssue,
)

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


def _load_schemas() -> tuple[dict[str, Any], dict[str, Any], Registry[Any]]:
    schemas: list[dict[str, Any]] = []
    schema_directory = files("baron_kline").joinpath("schemas")
    for resource in sorted(schema_directory.iterdir(), key=lambda item: item.name):
        if resource.name.endswith(".json"):
            schemas.append(json.loads(resource.read_text(encoding="utf-8")))
    registry: Registry[Any] = Registry()
    for schema in schemas:
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    chart_root = next(
        schema for schema in schemas
        if schema["$id"].endswith("/chart-scene.schema.json")
    )
    time_series_root = next(
        schema for schema in schemas
        if schema["$id"].endswith("/time-series-scene.schema.json")
    )
    return chart_root, time_series_root, registry


_ROOT_SCHEMA, _TIME_SERIES_ROOT_SCHEMA, _REGISTRY = _load_schemas()
_VALIDATOR = Draft202012Validator(_ROOT_SCHEMA, registry=_REGISTRY)
_TIME_SERIES_VALIDATOR = Draft202012Validator(
    _TIME_SERIES_ROOT_SCHEMA,
    registry=_REGISTRY,
)


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
    candle_pane = next(
        (pane for pane in scene["panes"] if pane["kind"] == "candle"),
        None,
    )
    logarithmic = bool(candle_pane and any(
        axis["role"] == "primary" and axis.get("scale") == "logarithmic"
        for axis in candle_pane["yAxes"]
    ))
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
        if logarithmic and any(bar[key] <= 0 for key in ("open", "high", "low", "close")):
            issues.append(_issue(
                "INVALID_MARKET_DATA", path,
                "Logarithmic candle OHLC values must all be greater than zero.",
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
            axis_path = f"{path}/yAxes/{axis_index}"
            runtime_version = scene["runtime"]["runtimeVersion"]
            if runtime_version == "0.1.0" and "scale" in axis:
                issues.append(_issue(
                    "SCENE_SCHEMA_INVALID", f"{axis_path}/scale",
                    "Runtime 0.1.0 Y-axes must omit scale to preserve M1 canonical bytes.",
                ))
            if runtime_version == "0.2.0" and "scale" not in axis:
                issues.append(_issue(
                    "SCENE_SCHEMA_INVALID", f"{axis_path}/scale",
                    "Runtime 0.2.0 requires an explicit scale on every Y-axis.",
                ))
            if (
                runtime_version == "0.2.0"
                and not (pane["kind"] == "candle" and axis["role"] == "primary")
                and axis.get("scale") != "linear"
            ):
                issues.append(_issue(
                    "SCENE_SCHEMA_INVALID", f"{axis_path}/scale",
                    "Only the candle primary Y-axis may use logarithmic scale.",
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
    elif overlay_type == "priceMeasurement":
        _require_overlay_keys(overlay, path, ["start", "end"], issues)
    elif overlay_type == "crossLine":
        _require_overlay_keys(overlay, path, ["point"], issues)


def _overlay_price_coordinates(
    overlay: dict[str, Any],
    path: str,
) -> list[tuple[str, float]]:
    result: list[tuple[str, float]] = []

    def add(value: Any, value_path: str) -> None:
        if value is not None:
            result.append((value_path, value))

    overlay_type = overlay["type"]
    if overlay_type in {"horizontalStraightLine", "priceLine", "simpleTag"}:
        add(overlay.get("anchor", {}).get("value"), f"{path}/anchor/value")
    elif overlay_type in {"horizontalRayLine", "horizontalSegment"}:
        add(overlay.get("value"), f"{path}/value")
    elif overlay_type in {"verticalRayLine", "verticalSegment"}:
        add(overlay.get("startValue"), f"{path}/startValue")
        add(overlay.get("endValue"), f"{path}/endValue")
    elif overlay_type in {
        "rayLine", "segment", "straightLine", "fibonacciLine",
        "priceChannelLine", "parallelStraightLine", "brush",
    }:
        for index, point in enumerate(overlay.get("points", [])):
            add(point.get("value"), f"{path}/points/{index}/value")
    elif overlay_type in {"simpleAnnotation", "crossLine", "callout", "text"}:
        add(overlay.get("point", {}).get("value"), f"{path}/point/value")
    elif overlay_type in {"rectangle", "arrow", "priceMeasurement"}:
        add(overlay.get("start", {}).get("value"), f"{path}/start/value")
        add(overlay.get("end", {}).get("value"), f"{path}/end/value")
    return result


def _validate_overlays(scene: dict[str, Any], issues: list[SceneIssue]) -> None:
    overlays = scene["overlays"]
    _unique([overlay["id"] for overlay in overlays], "/overlays", "Overlay", issues)
    pane_ids = {pane["id"] for pane in scene["panes"]}
    candle_pane = next(
        (pane for pane in scene["panes"] if pane["kind"] == "candle"),
        None,
    )
    candle_pane_id = candle_pane["id"] if candle_pane else None
    logarithmic = bool(candle_pane and any(
        axis["role"] == "primary" and axis.get("scale") == "logarithmic"
        for axis in candle_pane["yAxes"]
    ))
    timestamps = {bar["timestamp"] for bar in scene["data"]}
    for index, overlay in enumerate(overlays):
        path = f"/overlays/{index}"
        if overlay["paneId"] not in pane_ids:
            issues.append(_issue(
                "INVALID_REFERENCE", f"{path}/paneId",
                "Overlay paneId does not exist.",
            ))
        _validate_overlay_shape(overlay, path, issues)
        if (
            scene["runtime"]["runtimeVersion"] == "0.1.0"
            and overlay["type"] == "priceMeasurement"
        ):
            issues.append(_issue(
                "SCENE_SCHEMA_INVALID", f"{path}/type",
                "Runtime 0.1.0 does not support priceMeasurement.",
            ))
        for coordinate_path, value in _overlay_price_coordinates(overlay, path):
            if (
                overlay["type"] == "priceMeasurement"
                or (logarithmic and overlay["paneId"] == candle_pane_id)
            ) and value <= 0:
                message = (
                    "priceMeasurement values must be greater than zero."
                    if overlay["type"] == "priceMeasurement"
                    else "Logarithmic Overlay price coordinates must be greater than zero."
                )
                issues.append(_issue(
                    "SCENE_SCHEMA_INVALID", coordinate_path, message,
                ))
        if overlay["type"] == "priceMeasurement":
            for key in ("start", "end"):
                point = overlay.get(key)
                if point is not None and point["timestamp"] not in timestamps:
                    issues.append(_issue(
                        "INVALID_REFERENCE", f"{path}/{key}/timestamp",
                        "priceMeasurement timestamps must reference embedded market-data bars.",
                    ))


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


def _time_series_issue(
    code: str,
    path: str,
    message: str,
) -> TimeSeriesSceneIssue:
    return TimeSeriesSceneIssue(code=code, path=path, message=message)


def _assert_time_series_number_domain(value: Any, path: str = "/") -> None:
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, int):
        try:
            numeric = float(value)
        except OverflowError as error:
            raise TimeSeriesSceneError(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                path,
                "Numeric values must be finite binary64 values.",
            ) from error
        if not math.isfinite(numeric):
            raise TimeSeriesSceneError(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                path,
                "Numeric values must be finite binary64 values.",
            )
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise TimeSeriesSceneError(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                path,
                "Numeric values must be finite binary64 values.",
            )
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            _assert_time_series_number_domain(child, f"{path.rstrip('/')}/{index}")
        return
    if isinstance(value, dict):
        for key, child in value.items():
            encoded = str(key).replace("~", "~0").replace("/", "~1")
            _assert_time_series_number_domain(
                child,
                f"{path.rstrip('/')}/{encoded}",
            )


def _normalize_time_series_numbers(value: Any) -> Any:
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int) and abs(value) > SAFE_INTEGER_MAX:
        return float(value)
    if isinstance(value, list):
        return [_normalize_time_series_numbers(child) for child in value]
    if isinstance(value, dict):
        return {
            key: _normalize_time_series_numbers(child)
            for key, child in value.items()
        }
    return value


def _time_series_structural_paths(error: Any) -> list[str]:
    parts = list(error.absolute_path)
    if error.validator == "required" and isinstance(error.instance, dict):
        match = re.fullmatch(
            r"'(?P<property>[^']+)' is a required property",
            error.message,
        )
        missing = match.group("property") if match is not None else None
        if missing is not None:
            return [_pointer([*parts, missing])]
    elif (
        error.validator == "additionalProperties"
        and error.validator_value is False
        and isinstance(error.instance, dict)
    ):
        known = set(error.schema.get("properties", {}))
        extra = [key for key in error.instance if key not in known]
        if extra:
            return [_pointer([*parts, key]) for key in extra]
    return [_pointer(parts)]


def _time_series_structural_message(error: Any) -> str:
    if error.validator == "required":
        match = re.fullmatch(
            r"'(?P<property>[^']+)' is a required property",
            error.message,
        )
        if match is not None:
            return f"must have required property '{match.group('property')}'"
    if error.validator == "additionalProperties":
        return "must NOT have additional properties"
    return error.message


def _time_series_structural_code(path: str, validator: str) -> str:
    if path == "/version" and validator == "const":
        return "TIME_SERIES_SCENE_VERSION_UNSUPPORTED"
    if path in {"/runtime/engine", "/runtime/engineVersion"} and validator == "const":
        return "TIME_SERIES_ENGINE_VERSION_MISMATCH"
    return "TIME_SERIES_SCENE_SCHEMA_INVALID"


def _validate_time_series_semantics(
    scene: dict[str, Any],
) -> list[TimeSeriesSceneIssue]:
    issues: list[TimeSeriesSceneIssue] = []
    series_ids: set[str] = set()
    first_series = scene["series"][0]
    for index, series in enumerate(scene["series"]):
        if series["id"] in series_ids:
            issues.append(_time_series_issue(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                f"/series/{index}/id",
                f"Duplicate time series id: {series['id']}.",
            ))
        series_ids.add(series["id"])
        if series["unit"] != first_series["unit"]:
            issues.append(_time_series_issue(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                f"/series/{index}/unit",
                "All time series must use the same unit.",
            ))
        if series["precision"] != first_series["precision"]:
            issues.append(_time_series_issue(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                f"/series/{index}/precision",
                "All time series must use the same precision.",
            ))

    previous_timestamp: int | None = None
    timestamps: set[int] = set()
    for index, point in enumerate(scene["data"]):
        timestamp = point["timestamp"]
        if previous_timestamp is not None and timestamp <= previous_timestamp:
            issues.append(_time_series_issue(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                f"/data/{index}/timestamp",
                "Time series timestamps must be strictly increasing.",
            ))
        previous_timestamp = timestamp
        timestamps.add(timestamp)
        value_ids = set(point["values"])
        missing = series_ids - value_ids
        unknown = value_ids - series_ids
        for series_id in sorted(missing):
            encoded = series_id.replace("~", "~0").replace("/", "~1")
            issues.append(_time_series_issue(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                f"/data/{index}/values/{encoded}",
                f"Missing value for time series: {series_id}.",
            ))
        for series_id in sorted(unknown):
            encoded = series_id.replace("~", "~0").replace("/", "~1")
            issues.append(_time_series_issue(
                "TIME_SERIES_SCENE_SCHEMA_INVALID",
                f"/data/{index}/values/{encoded}",
                f"Unknown time series value key: {series_id}.",
            ))

    if scene["viewport"]["anchorTimestamp"] not in timestamps:
        issues.append(_time_series_issue(
            "TIME_SERIES_SCENE_SCHEMA_INVALID",
            "/viewport/anchorTimestamp",
            "Viewport anchorTimestamp must reference a data point.",
        ))
    return issues


def validate_time_series_scene(value: Any) -> dict[str, Any]:
    _assert_time_series_number_domain(value)
    normalized = _normalize_time_series_numbers(value)
    errors = list(_TIME_SERIES_VALIDATOR.iter_errors(normalized))
    if errors:
        issues: list[TimeSeriesSceneIssue] = []
        for error in errors:
            for path in _time_series_structural_paths(error):
                code = _time_series_structural_code(path, error.validator)
                issues.append(_time_series_issue(
                    code,
                    path,
                    _time_series_structural_message(error),
                ))
        first = issues[0]
        raise TimeSeriesSceneError(
            first.code,
            first.path,
            first.message,
            issues,
        )
    scene = copy.deepcopy(normalized)
    semantic_issues = _validate_time_series_semantics(scene)
    if semantic_issues:
        first = semantic_issues[0]
        raise TimeSeriesSceneError(
            first.code,
            first.path,
            first.message,
            semantic_issues,
        )
    return _sort_json(scene)


def canonical_time_series_scene_bytes(value: Any) -> bytes:
    if hasattr(value, "to_dict"):
        value = value.to_dict()
    return rfc8785.dumps(validate_time_series_scene(value))


def canonical_time_series_scene_json(value: Any) -> str:
    return canonical_time_series_scene_bytes(value).decode("utf-8")


def hash_canonical_time_series_scene(value: Any) -> str:
    return hashlib.sha256(canonical_time_series_scene_bytes(value)).hexdigest()
