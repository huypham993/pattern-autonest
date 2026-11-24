"""Baseline: bounding-box packing (MaxRects, bottom-left rule).

This is the reference the true-shape solver is compared with.  Each part is
reduced to the axis-aligned box of its envelope (at 0 or 90 degrees when the
rotation settings allow it), grown by the spacing, and packed with the
classic MaxRects algorithm (Jylanki 2010) using the bottom-left rule (lowest
top edge, then leftmost), i.e. the same objective as the true-shape solver,
so "used height" is comparable.  It never looks at the real
shape, so it cannot interlock concave parts or use holes.

The result is a normal autonest.placement/1 document, checked by the same
independent verifier.
"""
from __future__ import annotations

import time
from typing import Any

from .analyze import ENGINE_VERSION, analyze_document
from .nest import EPS_MM, assemble, build_parts
from .rotation import candidate_angles


class MaxRects:
    def __init__(self, x: float, y: float, w: float, h: float):
        self.free = [(x, y, w, h)]

    def insert(self, sizes):
        """sizes: list of (w, h, tag).  Returns (x, y, w, h, tag) of the lowest-top, then leftmost fit, or None."""
        best = None
        for fx, fy, fw, fh in self.free:
            for w, h, tag in sizes:
                if w <= fw + 1e-9 and h <= fh + 1e-9:
                    key = (round(fy + h, 9), round(fx, 9), min(fw - w, fh - h))
                    if best is None or key < best[0]:
                        best = (key, (fx, fy, w, h, tag))
        if best is None:
            return None
        rect = best[1]
        self._split(rect[:4])
        return rect

    def _split(self, used):
        ux, uy, uw, uh = used
        out = []
        for fx, fy, fw, fh in self.free:
            if ux >= fx + fw or ux + uw <= fx or uy >= fy + fh or uy + uh <= fy:
                out.append((fx, fy, fw, fh))
                continue
            if ux > fx:
                out.append((fx, fy, ux - fx, fh))
            if ux + uw < fx + fw:
                out.append((ux + uw, fy, fx + fw - ux - uw, fh))
            if uy > fy:
                out.append((fx, fy, fw, uy - fy))
            if uy + uh < fy + fh:
                out.append((fx, uy + uh, fw, fy + fh - uy - uh))
        # prune rectangles contained in another one
        out = [r for r in out if r[2] > 1e-9 and r[3] > 1e-9]
        keep = []
        for i, a in enumerate(out):
            contained = False
            for j, b in enumerate(out):
                if i != j and a[0] >= b[0] - 1e-12 and a[1] >= b[1] - 1e-12 and \
                        a[0] + a[2] <= b[0] + b[2] + 1e-12 and a[1] + a[3] <= b[1] + b[3] + 1e-12:
                    if a != b or i > j:
                        contained = True
                        break
            if not contained:
                keep.append(a)
        self.free = keep


def baseline_document(doc: dict, sha256: str | None = None, overrides: dict | None = None,
                      analysis: dict | None = None, verify: bool = True) -> dict[str, Any]:
    t0 = time.perf_counter()
    if analysis is None:
        analysis = analyze_document(doc, sha256, overrides)
    settings = analysis["settings"]
    spacing = float(settings["spacing_mm"])
    gap = spacing + 2 * EPS_MM  # same safety clearance as the true-shape solver
    ux0, uy0, ux1, uy1 = analysis["frame"]["usable_mm"]
    allowed = candidate_angles(settings["rotation"])
    angles = [0.0] if 0.0 in allowed else ([180.0] if 180.0 in allowed else [])
    quarter = [a for a in (90.0, 270.0) if a in allowed]
    angles += quarter[:1]
    parts, unplaced = build_parts(analysis, settings)
    if analysis["issues"] and any(i["severity"] == "error" for i in analysis["issues"]):
        unplaced += [{"id": p.id, "reason": "INVALID_GEOMETRY", "detail": "global error"} for p in parts]
        parts = []
    if not angles:
        unplaced += [{"id": p.id, "reason": "DOES_NOT_FIT", "detail": "baseline needs a multiple of 90 degrees"}
                     for p in parts]
        parts = []

    # boxes grown by the gap, in a bin grown by gap/2 on every side
    packer = MaxRects(ux0 - gap / 2, uy0 - gap / 2, ux1 - ux0 + gap, uy1 - uy0 + gap)
    entries = []
    for p in sorted(parts, key=lambda q: (-(q.env_bounds[2] - q.env_bounds[0]) * (q.env_bounds[3] - q.env_bounds[1]),
                                          q.index)):
        w = p.env_bounds[2] - p.env_bounds[0]
        h = p.env_bounds[3] - p.env_bounds[1]
        sizes = []
        for a in angles:
            ww, hh = (w, h) if a % 180.0 == 0 else (h, w)
            sizes.append((ww + gap, hh + gap, a))
        r = packer.insert(sizes)
        if r is None:
            unplaced.append({"id": p.id, "reason": "NO_SPACE_LEFT", "detail": "no free rectangle (bbox baseline)"})
            continue
        x, y, rw, rh, a = r
        # pivot = envelope bbox centre, so the rotated box stays centred on the target
        entries.append((p, a, (x + rw / 2.0, y + rh / 2.0)))
    engine = {"name": "autonest", "version": ENGINE_VERSION, "solver": "baseline-maxrects-bl",
              "note": "bounding-box packing reference, not true-shape"}
    return assemble(doc, sha256, analysis, entries, unplaced, engine, {}, verify, t0)
