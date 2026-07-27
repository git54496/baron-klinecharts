from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SceneIssue:
    code: str
    path: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"code": self.code, "path": self.path, "message": self.message}


class SceneError(ValueError):
    def __init__(
        self,
        code: str,
        path: str,
        message: str,
        issues: list[SceneIssue] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.path = path
        self.message = message
        self.issues = tuple(issues or [SceneIssue(code, path, message)])

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "path": self.path,
            "message": self.message,
            "issues": [item.to_dict() for item in self.issues],
        }
