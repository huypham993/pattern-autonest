"""Diagnostics reported by geometry extraction and validation.

Codes are stable identifiers (used by the JSX UI and by tests); messages are
human readable (Vietnamese) and may change.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ERROR = "error"      # part cannot be nested until the user fixes it
WARNING = "warning"  # part is nestable, but the user should look at it
INFO = "info"        # informational, no action required

_SEVERITY_RANK = {INFO: 0, WARNING: 1, ERROR: 2}


@dataclass
class Issue:
    code: str
    severity: str
    message: str
    node_path: list[int] | None = None
    data: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {"code": self.code, "severity": self.severity, "message": self.message}
        if self.node_path is not None:
            out["node_path"] = list(self.node_path)
        if self.data:
            out["data"] = self.data
        return out


def worst_severity(issues: list[Issue]) -> str:
    worst = INFO
    for it in issues:
        if _SEVERITY_RANK[it.severity] > _SEVERITY_RANK[worst]:
            worst = it.severity
    return worst


def status_from_issues(issues: list[Issue]) -> str:
    sev = worst_severity(issues)
    return {ERROR: "error", WARNING: "warning", INFO: "ok"}[sev]
