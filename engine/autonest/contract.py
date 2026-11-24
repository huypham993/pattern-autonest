"""JSON contract between Illustrator (JSX) and the Python engine.

Schemas (JSON Schema draft-07) live in ``schema/``; this module performs the
same structural checks without a third-party dependency and fills defaults.

    autonest.geometry/1   Illustrator -> engine   (raw Bézier data, points)
    autonest.analysis/1   engine -> UI            (silhouettes + diagnostics)
    autonest.placement/1  engine -> Illustrator   (rotation + translation)
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

GEOMETRY_SCHEMA = "autonest.geometry/1"
ANALYSIS_SCHEMA = "autonest.analysis/1"
PLACEMENT_SCHEMA = "autonest.placement/1"

DEFAULT_SETTINGS: dict[str, Any] = {
    "spacing_mm": 5.0,
    "margin_mm": 10.0,
    "curve_tolerance_mm": 0.25,
    "conservative_curves": True,
    "rotation": {
        "preset": "step",            # fixed | 0_180 | 0_90_180_270 | step | custom
        "step_deg": 5.0,
        "custom_angles_deg": [],
        "allow_full_360": True,
        "max_abs_deg": 180.0,
        "prefer_original": True,
        "grain_lock": False,         # true -> only 0 and 180 degrees
        "allow_mirror": False,
    },
    "optimization": {
        "quality": "balanced",       # fast | balanced | high_quality
        "time_limit_s": 60.0,
        "max_iterations": None,
        "seed": 1,
        "start_corner": "bottom_left",   # bottom_left | bottom_right | top_left | top_right: where nesting starts
    },
    "material": {
        "mode": "fixed_artboard",    # fixed_artboard | roll
        "roll_max_length_mm": None,
        "sheet_width_mm": None,      # fabric width (x); None = artboard width
        "sheet_length_mm": None,     # fabric length (y); None = artboard height
    },
    "part_in_hole": True,
    "opaque_policy": "cut_line",  # cut_line | require_outline | use_bounds
}


class ContractError(ValueError):
    pass


def deep_merge(base: dict, override: dict | None) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


# shortcut: Illustrator's canvas is 5779 mm and the artboard's place on it is unknown here; a roll that reaches past
# the canvas makes Apply fail its tracker check and roll back. Upgrade: export the canvas bounds with the geometry.
ROLL_MAX_LENGTH_MM = 5000.0


def sheet_rect_mm(settings: dict, width_mm: float, height_mm: float) -> tuple[float, float, float, float]:
    """Fabric rectangle in the sheet frame (mm, origin = artboard bottom-left, y up). It starts at the artboard's
    bottom-left corner and may extend past the artboard to the right and upward; when nesting starts at a top
    corner it hangs from the artboard's top-left corner instead and extends downward. Defaults to the whole
    artboard. In roll mode the length is as long as needed, up to roll_max_length_mm (default ROLL_MAX_LENGTH_MM)."""
    mat = settings["material"]
    def given(key, default):
        return default if mat.get(key) is None else mat[key]
    w = given("sheet_width_mm", width_mm)
    h = given("roll_max_length_mm", ROLL_MAX_LENGTH_MM) if mat.get("mode") == "roll" else given("sheet_length_mm", height_mm)
    if w <= 0 or h <= 0:
        raise ValueError("Fabric width and length must be > 0.")
    if (settings.get("optimization", {}).get("start_corner") or "").startswith("top"):
        return (0.0, float(height_mm) - float(h), float(w), float(height_mm))
    return (0.0, 0.0, float(w), float(h))


def _req(obj: Any, key: str, typ, where: str):
    if not isinstance(obj, dict) or key not in obj:
        raise ContractError(f"{where}: missing required field '{key}'")
    val = obj[key]
    if typ is not None and not isinstance(val, typ):
        raise ContractError(f"{where}.{key}: expected {typ}, got {type(val).__name__}")
    return val


def _rect(val: Any, where: str) -> None:
    if not (isinstance(val, list) and len(val) == 4):
        raise ContractError(f"{where}: expected [left, top, right, bottom]")


NODE_KINDS = {"group", "path", "compound", "opaque"}


def _check_node(node: Any, where: str) -> None:
    kind = _req(node, "kind", str, where)
    if kind not in NODE_KINDS:
        raise ContractError(f"{where}.kind: unknown node kind '{kind}'")
    if kind == "group":
        for i, ch in enumerate(_req(node, "children", list, where)):
            _check_node(ch, f"{where}.children[{i}]")
    elif kind == "path":
        _req(node, "closed", bool, where)
        pts = _req(node, "points", list, where)
        for j, p in enumerate(pts):
            if not (isinstance(p, list) and len(p) == 6):
                raise ContractError(f"{where}.points[{j}]: expected [ax,ay,lx,ly,rx,ry]")
    elif kind == "compound":
        for i, ch in enumerate(_req(node, "paths", list, where)):
            if not isinstance(ch, dict) or ch.get("kind") != "path":
                raise ContractError(f"{where}.paths[{i}]: compound children must be paths")
            _check_node(ch, f"{where}.paths[{i}]")
    elif kind == "opaque":
        _req(node, "typename", str, where)


def validate_geometry_doc(doc: Any) -> dict:
    """Structural validation; returns the document with merged settings."""
    if not isinstance(doc, dict):
        raise ContractError("geometry document must be a JSON object")
    schema = _req(doc, "schema", str, "$")
    if schema != GEOMETRY_SCHEMA:
        raise ContractError(f"$.schema: expected '{GEOMETRY_SCHEMA}', got '{schema}'")
    cs = _req(doc, "coordinate_system", dict, "$")
    if cs.get("units") != "pt":
        raise ContractError("$.coordinate_system.units must be 'pt'")
    if cs.get("y_axis") not in ("up", "down"):
        raise ContractError("$.coordinate_system.y_axis must be 'up' or 'down'")
    ab = _req(doc, "artboard", dict, "$")
    _rect(_req(ab, "rect_pt", list, "$.artboard"), "$.artboard.rect_pt")
    groups = _req(doc, "groups", list, "$")
    seen = set()
    for i, g in enumerate(groups):
        where = f"$.groups[{i}]"
        gid = _req(g, "id", str, where)
        if gid in seen:
            raise ContractError(f"{where}.id: duplicate id '{gid}'")
        seen.add(gid)
        root = _req(g, "root", dict, where)
        if root.get("kind") != "group":
            raise ContractError(f"{where}.root.kind must be 'group'")
        _check_node(root, f"{where}.root")
    out = dict(doc)
    out["settings"] = deep_merge(DEFAULT_SETTINGS, doc.get("settings"))
    return out


def load_geometry(path: str | Path) -> tuple[dict, str]:
    """Load + validate; returns (document, sha256 of the raw file)."""
    raw = Path(path).read_bytes()
    # Illustrator may write a UTF-8 BOM
    text = raw.decode("utf-8-sig")
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as e:
        raise ContractError(f"invalid JSON: {e}") from e
    return validate_geometry_doc(doc), hashlib.sha256(raw).hexdigest()
