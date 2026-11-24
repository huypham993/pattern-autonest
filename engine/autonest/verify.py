"""Independent verification of a placement against the original geometry.

This module deliberately shares nothing with the solver (no NFP, no Clipper,
no collision shapes).  It rebuilds each group's true shape from geometry.json
(Phase 2 extraction), applies the *Illustrator matrix* written in
placement.json, and checks with exact Shapely/GEOS predicates:

* contract     schema, geometry sha256, ids exist, no duplicates, every group
               either placed or listed as unplaced;
* rigidity     matrix is a pure rotation (det = +1, orthonormal), no mirror
               unless allowed, angle in the allowed rotation set, and the
               matrix equals the declared pivot/target/rotation;
* boundary     each placed envelope lies inside the usable rectangle
               (artboard minus margin);
* collision    no two placed envelopes overlap;
* spacing      the exact distance between any two placed envelopes is at
               least spacing_mm.

The envelope is the conservative outline used everywhere in the engine:
the flattened silhouette, grown by the curve tolerance for parts with
curves, so it contains the real Bezier outline.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import shapely
from shapely import affinity

from . import regions
from .contract import PLACEMENT_SCHEMA, deep_merge, sheet_rect_mm
from .rotation import candidate_angles
from .silhouette import extract_part
from .transform import to_illustrator_matrix
from .units import MM_PER_PT, SheetFrame

BOUNDARY_TOL_MM = 1e-3
SPACING_TOL_MM = 1e-6
RIGID_TOL = 1e-9
ANGLE_TOL_DEG = 1e-6


def _mm_affine(matrix, frame: SheetFrame):
    """Illustrator pt matrix -> shapely affine params acting on sheet mm coordinates."""
    a, b, c, d, tx, ty = matrix
    ox, oy = frame.left_pt, frame.bottom_pt
    # p_mm' = A p_mm + k (A o + t - o)
    ex = MM_PER_PT * (a * ox + c * oy + tx - ox)
    ey = MM_PER_PT * (b * ox + d * oy + ty - oy)
    return [a, c, b, d, ex, ey]


def part_envelopes(doc: dict, settings: dict) -> dict[str, Any]:
    frame = SheetFrame.from_artboard_rect(doc["artboard"]["rect_pt"], doc["coordinate_system"]["y_axis"])
    tol = float(settings["curve_tolerance_mm"])
    conservative = bool(settings.get("conservative_curves", True))
    out = {}
    for g in doc["groups"]:
        pg = extract_part(g, frame, tol, settings.get("opaque_policy", "cut_line"),
                          float(settings["spacing_mm"]))
        env = regions.safe_offset(pg.silhouette, tol) if (conservative and pg.had_curves) else pg.silhouette
        out[g["id"]] = {"silhouette": pg.silhouette, "envelope": env}
    return out


def transformed_shapes(doc: dict, placement: dict, settings: dict | None = None) -> dict[str, dict]:
    settings = settings or deep_merge(doc["settings"], placement.get("settings"))
    frame = SheetFrame.from_artboard_rect(doc["artboard"]["rect_pt"], doc["coordinate_system"]["y_axis"])
    shapes = part_envelopes(doc, settings)
    out = {}
    for pl in placement["placements"]:
        sh = shapes.get(pl["id"])
        if sh is None:
            continue
        aff = _mm_affine(pl["matrix"], frame)
        out[pl["id"]] = {k: affinity.affine_transform(v, aff) for k, v in sh.items()}
    return out


def verify_placement(doc: dict, placement: dict) -> dict[str, Any]:
    problems: list[str] = []
    settings = deep_merge(doc["settings"], placement.get("settings"))
    spacing = float(settings["spacing_mm"])
    margin = float(settings["margin_mm"])
    allow_mirror = bool(settings["rotation"].get("allow_mirror", False))
    allowed = candidate_angles(settings["rotation"])
    frame = SheetFrame.from_artboard_rect(doc["artboard"]["rect_pt"], doc["coordinate_system"]["y_axis"])
    W, H = frame.width_mm, frame.height_mm
    sx0, sy0, sx1, sy1 = sheet_rect_mm(settings, W, H)
    usable = (sx0 + margin, sy0 + margin, sx1 - margin, sy1 - margin)

    # ---------------------------------------------------------------- contract
    if placement.get("schema") != PLACEMENT_SCHEMA:
        problems.append(f"schema is {placement.get('schema')!r}")
    sha = placement.get("source", {}).get("geometry_sha256")
    ids = [g["id"] for g in doc["groups"]]
    pids = [p["id"] for p in placement["placements"]]
    uids = [u["id"] for u in placement["unplaced"]]
    if len(set(pids)) != len(pids):
        problems.append("duplicate placement ids")
    for i in pids + uids:
        if i not in ids:
            problems.append(f"unknown group id {i}")
    if set(pids) & set(uids):
        problems.append(f"groups both placed and unplaced: {sorted(set(pids) & set(uids))}")
    missing = set(ids) - set(pids) - set(uids)
    if missing:
        problems.append(f"groups neither placed nor unplaced: {sorted(missing)}")
    notes = []
    for k in ("spacing_mm", "margin_mm", "curve_tolerance_mm"):
        if abs(float(settings[k]) - float(doc["settings"][k])) > 1e-12:
            notes.append(f"{k}={settings[k]} overrides geometry.json value {doc['settings'][k]}")

    # ---------------------------------------------------------------- rigidity
    rigidity = 0
    for pl in placement["placements"]:
        a, b, c, d, tx, ty = pl["matrix"]
        det = a * d - b * c
        ok = abs(math.hypot(a, b) - 1) < RIGID_TOL and abs(math.hypot(c, d) - 1) < RIGID_TOL and \
            abs(a * c + b * d) < RIGID_TOL
        mirror = det < 0
        if not ok or abs(abs(det) - 1) > RIGID_TOL:
            rigidity += 1
            problems.append(f"{pl['id']}: matrix is not rigid (scale/shear) det={det:.12f}")
        if mirror != bool(pl["mirror"]) or (mirror and not allow_mirror):
            rigidity += 1
            problems.append(f"{pl['id']}: mirror={mirror} not allowed/declared")
        ang = pl["rotation_deg"] % 360.0
        if not any(abs(((ang - x + 180.0) % 360.0) - 180.0) < ANGLE_TOL_DEG for x in allowed):
            rigidity += 1
            problems.append(f"{pl['id']}: rotation {ang} deg is not in the allowed set")
        ref = to_illustrator_matrix(pl["pivot_pt"], pl["target_pt"], pl["rotation_deg"], pl["mirror"])
        if max(abs(x - y) for x, y in zip(ref[:4], pl["matrix"][:4])) > 1e-9 or \
                max(abs(x - y) for x, y in zip(ref[4:], pl["matrix"][4:])) > 1e-4:
            rigidity += 1
            problems.append(f"{pl['id']}: matrix differs from pivot/target/rotation")

    # ---------------------------------------------------------------- geometry
    shapes = transformed_shapes(doc, placement, settings)
    order = [i for i in pids if i in shapes]
    boundary = 0
    for i in order:
        env = shapes[i]["envelope"]
        if env.is_empty:
            boundary += 1
            problems.append(f"{i}: empty shape")
            continue
        x0, y0, x1, y1 = env.bounds
        ex = max(usable[0] - x0, usable[1] - y0, x1 - usable[2], y1 - usable[3])
        if ex > BOUNDARY_TOL_MM:
            boundary += 1
            problems.append(f"{i}: outside the usable area by {ex:.4f} mm")

    collisions = 0
    spacing_viol = 0
    min_gap = None
    min_pair = None
    pairs_checked = 0
    envs = [shapes[i]["envelope"] for i in order]
    if len(envs) > 1:
        tree = shapely.STRtree(envs)
        reach = max(spacing, 0.0) + 50.0
        for a_idx, env in enumerate(envs):
            cand = tree.query(shapely.buffer(shapely.envelope(env), reach))
            for b_idx in cand:
                if b_idx <= a_idx:
                    continue
                pairs_checked += 1
                other = envs[b_idx]
                if env.intersects(other):
                    inter = env.intersection(other).area
                    if inter > 0:
                        collisions += 1
                        problems.append(f"{order[a_idx]} overlaps {order[b_idx]} ({inter:.4f} mm2)")
                        gap = 0.0
                    else:
                        gap = 0.0
                        if spacing > 0:
                            spacing_viol += 1
                            problems.append(f"{order[a_idx]} touches {order[b_idx]}")
                else:
                    gap = env.distance(other)
                    if gap < spacing - SPACING_TOL_MM:
                        spacing_viol += 1
                        problems.append(f"{order[a_idx]} - {order[b_idx]} gap {gap:.4f} mm < spacing {spacing} mm")
                if min_gap is None or gap < min_gap:
                    min_gap, min_pair = gap, (order[a_idx], order[b_idx])

    ok = not problems
    return {
        "ok": ok,
        "verifier": "autonest.verify (shapely/GEOS exact predicates, independent of the solver)",
        "geometry_sha256": sha,
        "placed": len(pids),
        "unplaced": len(uids),
        "collisions": collisions,
        "spacing_violations": spacing_viol,
        "boundary_violations": boundary,
        "rigidity_violations": rigidity,
        "min_gap_mm": round(min_gap, 6) if min_gap is not None else None,
        "min_gap_pair": list(min_pair) if min_pair else None,
        "pairs_checked": pairs_checked,
        "spacing_mm": spacing,
        "usable_mm": [round(v, 4) for v in usable],
        "tolerances": {"boundary_mm": BOUNDARY_TOL_MM, "spacing_mm": SPACING_TOL_MM},
        "problems": problems,
        "notes": notes,
    }
