"""Phase 2 pipeline: geometry JSON -> validated true-shape silhouettes.

For each selected group the analysis produces

* ``silhouette``  – flattened true shape (mm, sheet frame), holes kept;
* ``envelope``    – silhouette grown by the flattening tolerance when the part
                    has curves, so that the *real* Bézier outline is inside it
                    (conservative_curves=True);
* diagnostics     – geometry validation issues and a per-part status.

The engine (Phase 3) nests ``envelope`` grown by spacing/2.
"""
from __future__ import annotations

import math
import time
from typing import Any

import numpy as np
from shapely.geometry import MultiPolygon

from . import regions
from .contract import ANALYSIS_SCHEMA, deep_merge, sheet_rect_mm
from .issues import ERROR, INFO, WARNING, Issue, status_from_issues
from .rotation import candidate_orientations
from .silhouette import extract_part
from .units import SheetFrame

ENGINE_VERSION = "0.4.0"


def _exceeds(outer, inner) -> float:
    return max(inner[0] - outer[0], inner[1] - outer[1], outer[2] - inner[2], outer[3] - inner[3], 0.0)


def _box_delta(a, b) -> float:
    return max(abs(a[i] - b[i]) for i in range(4))


def rotated_extents(coords: np.ndarray, angle_deg: float, mirror: bool = False) -> tuple[float, float]:
    """Width/height of the AABB of ``coords`` after (mirror, then) rotation."""
    pts = coords.copy()
    if mirror:
        pts[:, 0] = -pts[:, 0]
    t = math.radians(angle_deg)
    c, s = math.cos(t), math.sin(t)
    x = pts[:, 0] * c - pts[:, 1] * s
    y = pts[:, 0] * s + pts[:, 1] * c
    return float(x.max() - x.min()), float(y.max() - y.min())


def fit_check(geom: MultiPolygon, usable_w: float, usable_h: float | None, orientations) -> list:
    """Orientations at which ``geom`` fits the usable rectangle.

    For a rectangular container this test is exact, not an approximation:
    a shape fits inside an axis-aligned rectangle iff its axis-aligned bounds
    (after rotation) fit.  It is used only to reject impossible parts early.
    """
    hull = np.asarray(geom.convex_hull.exterior.coords) if not geom.is_empty else None
    if hull is None:
        return []
    eps = 1e-6
    out = []
    for o in orientations:
        w, h = rotated_extents(hull, o.angle_deg, o.mirror)
        if w <= usable_w + eps and (usable_h is None or h <= usable_h + eps):
            out.append(o)
    return out


def analyze_document(doc: dict, sha256: str | None = None, overrides: dict | None = None) -> dict[str, Any]:
    t0 = time.perf_counter()
    settings = deep_merge(doc["settings"], overrides)
    frame = SheetFrame.from_artboard_rect(doc["artboard"]["rect_pt"], doc["coordinate_system"]["y_axis"])
    tol = float(settings["curve_tolerance_mm"])
    spacing = float(settings["spacing_mm"])
    margin = float(settings["margin_mm"])
    if tol <= 0:
        raise ValueError("curve_tolerance_mm must be > 0")
    if spacing < 0 or margin < 0:
        raise ValueError("spacing_mm and margin_mm must be >= 0")

    global_issues: list[Issue] = []
    W, H = frame.width_mm, frame.height_mm
    sx0, sy0, sx1, sy1 = sheet_rect_mm(settings, W, H)
    usable = (sx0 + margin, sy0 + margin, sx1 - margin, sy1 - margin)
    usable_w = usable[2] - usable[0]
    usable_h: float | None = usable[3] - usable[1]
    if usable_w <= 0 or (usable_h is not None and usable_h <= 0):
        global_issues.append(Issue("MARGIN_TOO_LARGE", ERROR, "Margin is at least half the fabric (or artboard) size."))

    orientations = candidate_orientations(settings["rotation"])
    parts = []
    for g in doc["groups"]:
        parts.append(_analyze_group(g, frame, settings, tol, spacing, usable_w, usable_h, orientations))

    nestable = [p for p in parts if p["status"] != "error"]
    usable_area = usable_w * (usable_h if usable_h is not None else 0.0)
    total_nest_area = sum(p["metrics"]["nest_area_mm2"] for p in nestable)
    if usable_h is not None and usable_area > 0 and total_nest_area > usable_area:
        global_issues.append(Issue(
            "TOTAL_AREA_EXCEEDS_SHEET", WARNING,
            f"Total part area (including spacing) {total_nest_area:,.0f} mm² exceeds the usable area of "
            f"{usable_area:,.0f} mm²; not all parts can fit.",
            data={"total_nest_area_mm2": round(total_nest_area, 1), "usable_area_mm2": round(usable_area, 1)},
        ))

    sil_area = sum(p["metrics"]["area_mm2"] for p in nestable)
    bbox_area = sum(p["metrics"]["bbox_area_mm2"] for p in nestable)
    return {
        "schema": ANALYSIS_SCHEMA,
        "engine": {"name": "autonest", "version": ENGINE_VERSION},
        "source": {
            "geometry_sha256": sha256,
            "document": doc.get("document", {}),
            "artboard": doc["artboard"],
        },
        "frame": {
            "units": "mm",
            "origin": "artboard_bottom_left",
            "y_axis": "up",
            "artboard_mm": [0.0, 0.0, round(W, 4), round(H, 4)],
            "usable_mm": [round(v, 4) for v in (usable[0], usable[1], usable[0] + usable_w,
                                                 usable[1] + (usable_h if usable_h is not None else H - 2 * margin))],
        },
        "settings": settings,
        "orientations": [{"angle_deg": o.angle_deg, "mirror": o.mirror} for o in orientations],
        "summary": {
            "total_groups": len(parts),
            "ok": sum(p["status"] == "ok" for p in parts),
            "warning": sum(p["status"] == "warning" for p in parts),
            "error": sum(p["status"] == "error" for p in parts),
            "nestable": len(nestable),
            "skipped_selection": len(doc.get("skipped_selection", [])),
            "silhouette_area_mm2": round(sil_area, 2),
            "bbox_area_mm2": round(bbox_area, 2),
            "silhouette_to_bbox_ratio": round(sil_area / bbox_area, 4) if bbox_area > 0 else None,
            "total_nest_area_mm2": round(total_nest_area, 2),
            "usable_area_mm2": round(usable_area, 2) if usable_h is not None else None,
            "elapsed_s": round(time.perf_counter() - t0, 3),
        },
        "issues": [i.to_json() for i in global_issues],
        "skipped_selection": doc.get("skipped_selection", []),
        "parts": parts,
    }


def _analyze_group(g, frame, settings, tol, spacing, usable_w, usable_h, orientations) -> dict:
    t0 = time.perf_counter()
    pg = extract_part(g, frame, tol, settings.get("opaque_policy", "cut_line"), spacing)
    issues = list(pg.issues)
    for e in g.get("export_issues") or []:  # diagnostics raised on the Illustrator side
        issues.append(Issue(e["code"], e.get("severity", WARNING), e.get("message", ""), e.get("node_path")))
    sil = pg.silhouette
    if sil.is_empty and not any(i.severity == ERROR for i in issues):
        issues.append(Issue("EMPTY_SILHOUETTE", ERROR,
                            "No printable area found (no path with a valid fill/stroke). Add a NEST_OUTLINE."))

    # --- consistency between our geometry and Illustrator's own bounds -------
    gb = g.get("geometric_bounds_pt")
    if gb and (pg.bounds_all_mm or pg.bounds_visible_mm):
        ill = frame.bounds_to_mm(gb)
        deltas = [_box_delta(ill, b) for b in (pg.bounds_all_mm, pg.bounds_visible_mm) if b]
        d = min(deltas)
        if d > 25.0:
            issues.append(Issue("COORDINATE_MISMATCH", ERROR,
                                f"Extracted geometry differs by {d:.1f} mm from Illustrator's geometricBounds; "
                                "likely a coordinate system error. This part will not be nested.", data={"delta_mm": round(d, 3)}))
        elif d > max(0.5, 3 * tol):
            issues.append(Issue("BOUNDS_MISMATCH", WARNING,
                                f"Extracted bounds differ by {d:.2f} mm from Illustrator's geometricBounds.",
                                data={"delta_mm": round(d, 3)}))
    vb = g.get("visible_bounds_pt")
    # cut_line: overflow of the image past the cut line is already reported by extract_part
    if vb and not sil.is_empty and not g["root"].get("clipped") and pg.source != "cut_line":
        vis = frame.bounds_to_mm(vb)
        # Reference = everything we know is geometry (silhouette incl. strokes, plus
        # hidden/unpainted items, which Illustrator may or may not count in bounds).
        ref = sil.bounds
        for b in (pg.bounds_visible_mm, pg.bounds_all_mm):
            if b:
                ref = (min(ref[0], b[0]), min(ref[1], b[1]), max(ref[2], b[2]), max(ref[3], b[3]))
        ex = _exceeds(vis, ref if pg.source != "nest_outline" else sil.bounds)
        if ex > max(0.5, 2 * tol):
            code = "OUTLINE_SMALLER_THAN_ARTWORK" if pg.source == "nest_outline" else "APPEARANCE_EXCEEDS_GEOMETRY"
            msg = ("Group visibleBounds extend {:.2f} mm beyond NEST_OUTLINE." if code.startswith("OUTLINE")
                   else "visibleBounds exceed the silhouette by {:.2f} mm, possibly due to effects (drop shadow, brush, "
                        "opacity mask...) the script cannot read. Consider adding a NEST_OUTLINE.").format(ex)
            issues.append(Issue(code, WARNING, msg, data={"exceeds_mm": round(ex, 3)}))

    # --- conservative envelope and nest shape --------------------------------
    conservative = bool(settings.get("conservative_curves", True)) and pg.had_curves
    envelope = regions.safe_offset(sil, tol) if conservative else sil
    nest_shape = regions.safe_offset(envelope, spacing / 2.0) if spacing > 0 else envelope

    # --- feasibility against the usable sheet ----------------------------------
    fits = []
    if not envelope.is_empty:
        fits = fit_check(envelope, usable_w, usable_h, orientations)
        if not fits and usable_w > 0:
            bx = envelope.bounds
            issues.append(Issue("PART_TOO_LARGE", ERROR,
                                f"Part ({bx[2]-bx[0]:.1f} × {bx[3]-bx[1]:.1f} mm) does not fit the usable area at any "
                                "allowed rotation.", data={"orientations_tested": len(orientations)}))
        elif len(fits) < len(orientations):
            issues.append(Issue("FITS_ONLY_SOME_ORIENTATIONS", INFO,
                                f"Fits in only {len(fits)}/{len(orientations)} rotations.",
                                data={"fitting_angles_deg": [o.angle_deg for o in fits][:72]}))

    polys = regions.polygons_of(sil)
    n_holes = sum(len(p.interiors) for p in polys)
    n_vertices = sum(len(p.exterior.coords) - 1 + sum(len(h.coords) - 1 for h in p.interiors) for p in polys)
    if len(polys) > 1:
        issues.append(Issue("MULTIPLE_ISLANDS", INFO,
                            f"Silhouette has {len(polys)} separate pieces; the Group is still moved as one unit."))
    if n_holes:
        issues.append(Issue("HAS_HOLES", INFO, f"Silhouette has {n_holes} holes (used for part-in-hole)."))

    if not sil.is_empty:
        bx = sil.bounds
        bbox_area = (bx[2] - bx[0]) * (bx[3] - bx[1])
        hull_area = sil.convex_hull.area
        cx, cy = sil.centroid.x, sil.centroid.y
    else:
        bx, bbox_area, hull_area, cx, cy = None, 0.0, 0.0, None, None
    area = sil.area
    status = status_from_issues(issues)
    return {
        "id": g["id"],
        "uuid": g.get("uuid"),
        "name": g.get("name", ""),
        "status": status,
        "source": pg.source,
        "has_curves": pg.had_curves,
        "metrics": {
            "area_mm2": round(area, 3),
            "envelope_area_mm2": round(envelope.area, 3),
            "nest_area_mm2": round(nest_shape.area, 3),
            "bbox_mm": [round(v, 4) for v in bx] if bx else None,
            "bbox_area_mm2": round(bbox_area, 3),
            "hull_area_mm2": round(hull_area, 3),
            "bbox_fill_ratio": round(area / bbox_area, 4) if bbox_area > 0 else None,
            "convexity": round(area / hull_area, 4) if hull_area > 0 else None,
            "polygons": len(polys),
            "holes": n_holes,
            "vertices": n_vertices,
            "fitting_orientations": len(fits),
            "elapsed_s": round(time.perf_counter() - t0, 4),
        },
        "centroid_mm": [round(cx, 4), round(cy, 4)] if cx is not None else None,
        "issues": [i.to_json() for i in issues],
        "silhouette": regions.geometry_to_json(sil),
        "envelope": regions.geometry_to_json(envelope) if conservative else None,
    }
