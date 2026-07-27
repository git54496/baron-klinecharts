from __future__ import annotations

import copy
import csv
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .validation import validate_scene

_MISSING = object()


@dataclass(frozen=True)
class RuntimeIdentity:
    engine: str
    engine_version: str
    runtime_version: str

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> RuntimeIdentity:
        return cls(
            engine=value["engine"],
            engine_version=value["engineVersion"],
            runtime_version=value["runtimeVersion"],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine": self.engine,
            "engineVersion": self.engine_version,
            "runtimeVersion": self.runtime_version,
        }


@dataclass(frozen=True)
class MarketData:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: Any = _MISSING
    turnover: Any = _MISSING

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> MarketData:
        return cls(
            timestamp=value["timestamp"],
            open=value["open"],
            high=value["high"],
            low=value["low"],
            close=value["close"],
            volume=value.get("volume", _MISSING),
            turnover=value.get("turnover", _MISSING),
        )

    def to_dict(self) -> dict[str, Any]:
        value: dict[str, Any] = {
            "timestamp": self.timestamp,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
        }
        if self.volume is not _MISSING:
            value["volume"] = self.volume
        if self.turnover is not _MISSING:
            value["turnover"] = self.turnover
        return value


class SceneData(Sequence[MarketData]):
    REQUIRED_COLUMNS = ("timestamp", "open", "high", "low", "close")
    OPTIONAL_COLUMNS = ("volume", "turnover")

    def __init__(self, values: Iterable[MarketData]) -> None:
        self._values = tuple(values)

    def __getitem__(self, index: int | slice) -> MarketData | Sequence[MarketData]:
        return self._values[index]

    def __len__(self) -> int:
        return len(self._values)

    def to_list(self) -> list[dict[str, Any]]:
        return [item.to_dict() for item in self._values]

    @classmethod
    def from_dicts(cls, values: Iterable[Mapping[str, Any]]) -> SceneData:
        return cls(MarketData.from_dict(value) for value in values)

    @classmethod
    def from_rows(
        cls,
        rows: Any,
        *,
        columns: Mapping[str, str],
    ) -> SceneData:
        missing = [name for name in cls.REQUIRED_COLUMNS if name not in columns]
        if missing:
            raise ValueError(f"Explicit column mapping is missing: {', '.join(missing)}")
        if hasattr(rows, "to_dict"):
            rows = rows.to_dict(orient="records")
        values: list[MarketData] = []
        for row in rows:
            if not isinstance(row, Mapping):
                raise TypeError("Every market-data row must be a mapping.")
            mapped: dict[str, Any] = {}
            for name in (*cls.REQUIRED_COLUMNS, *cls.OPTIONAL_COLUMNS):
                source = columns.get(name)
                if source is not None and source in row and row[source] not in ("", None):
                    raw = row[source]
                    mapped[name] = int(raw) if name == "timestamp" else float(raw)
            values.append(MarketData.from_dict(mapped))
        return cls(values)

    @classmethod
    def from_csv(
        cls,
        path: str | Path,
        *,
        columns: Mapping[str, str],
    ) -> SceneData:
        with Path(path).open("r", encoding="utf-8", newline="") as source:
            return cls.from_rows(csv.DictReader(source), columns=columns)


class ChartScene:
    def __init__(self, document: dict[str, Any]) -> None:
        self._set_document(validate_scene(document))

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> ChartScene:
        return cls(copy.deepcopy(dict(value)))

    def _set_document(self, document: dict[str, Any]) -> None:
        self._document = copy.deepcopy(document)
        self.schema = document["schema"]
        self.version = document["version"]
        self.runtime = RuntimeIdentity.from_dict(document["runtime"])
        self.symbol = copy.deepcopy(document["symbol"])
        self.period = copy.deepcopy(document["period"])
        self.data = SceneData.from_dicts(document["data"])
        self.chart = copy.deepcopy(document["chart"])
        self.panes = copy.deepcopy(document["panes"])
        self.viewport = copy.deepcopy(document["viewport"])
        self.render = copy.deepcopy(document["render"])
        self.metadata = copy.deepcopy(document["metadata"])
        from .collections import IndicatorCollection, OverlayCollection
        self.overlays = OverlayCollection(self)
        self.indicators = IndicatorCollection(self)

    def _replace_document(self, candidate: dict[str, Any]) -> None:
        self._set_document(validate_scene(candidate))

    def to_dict(self) -> dict[str, Any]:
        return copy.deepcopy(self._document)
